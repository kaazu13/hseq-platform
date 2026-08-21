import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Part 3 of the localization-regression fix — a real "does this key exist"
 * check, not just locale-parity/ICU-argument checks (those only compare
 * locale files against EACH OTHER; nothing previously compared the code's
 * actual `t("key")` call sites against the catalog at all, which is
 * exactly how `Account.myRateRequests`/`Account.requestedRate` and 8
 * `MyHours` earnings keys shipped referencing keys that were never added
 * anywhere, including en.json).
 *
 * Approach: a real TypeScript AST walk (not a regex — this codebase's own
 * `t`/`tr` identifiers are too generic for a regex to scope safely without
 * false positives across unrelated local variables), scoped to the two
 * binding shapes actually used in this codebase:
 *
 *   const t = await getTranslations("Namespace");
 *   const [t, format] = await Promise.all([getTranslations("Namespace"), getFormatter()]);
 *
 * (and the client-side `useTranslations("Namespace")` equivalent of the
 * first shape). Binding resolution is FILE-SCOPED, not block-scoped: once
 * a variable name is bound to a namespace anywhere in a file, every call
 * to that identifier anywhere else in the same file (including inside a
 * nested function that receives it as a parameter, e.g.
 * `app/(app)/my-hours/page.tsx`'s `MyHoursTabSwitcher({ t }: { t:
 * Awaited<ReturnType<typeof getTranslations>> })`) is treated as using
 * that namespace. This is a deliberate simplification, not full scope
 * analysis — see this module's own header comment in the test file for
 * the one class of case it can't see (a translator function threaded
 * across FILES as a prop), which does not occur anywhere in this
 * codebase today (verified: only one file uses the
 * `Awaited<ReturnType<typeof getTranslations>>` parameter type, and it's
 * consumed within that same file).
 */

export type LiteralUsage = {
  file: string;
  line: number;
  namespace: string;
  key: string;
  boundVar: string;
};

export type DynamicUsage = {
  file: string;
  line: number;
  namespace: string;
  /** The raw template source, e.g. "tabs.${key}" */
  templateText: string;
  /** The literal text before the first `${`, e.g. "tabs." */
  staticPrefix: string;
};

export type OpaqueUsage = {
  file: string;
  line: number;
  namespace: string;
  boundVar: string;
};

export type ScanResult = {
  literalUsages: LiteralUsage[];
  dynamicUsages: DynamicUsage[];
  /** Calls whose key argument isn't a string/template literal at all (e.g. `t(someVariable)`) — cannot be statically resolved either way; reported so they're visible, never silently dropped. */
  opaqueUsages: OpaqueUsage[];
};

const TRANSLATION_FACTORY_NAMES = new Set(["getTranslations", "useTranslations"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function listSourceFiles(rootDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

function unwrapAwait(node: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(node) ? node.expression : node;
}

/** First-pass: every `const <name> = ...getTranslations("NS")...` / `useTranslations("NS")` binding in the file, including the `const [t, format] = await Promise.all([...])` destructuring shape. */
function collectBindings(sourceFile: ts.SourceFile): Map<string, string> {
  const bindings = new Map<string, string>();

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrapAwait(node.initializer);

      // const t = getTranslations("NS") / useTranslations("NS")
      if (ts.isIdentifier(node.name) && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && TRANSLATION_FACTORY_NAMES.has(init.expression.text)) {
        const arg = init.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          bindings.set(node.name.text, arg.text);
        }
      }

      // const [t, format] = await Promise.all([getTranslations("NS"), getFormatter()])
      if (ts.isArrayBindingPattern(node.name) && ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === "all") {
        const bindingPattern = node.name;
        const arrayArg = init.arguments[0];
        if (arrayArg && ts.isArrayLiteralExpression(arrayArg)) {
          arrayArg.elements.forEach((element, index) => {
            if (!ts.isCallExpression(element) || !ts.isIdentifier(element.expression) || !TRANSLATION_FACTORY_NAMES.has(element.expression.text)) return;
            const arg = element.arguments[0];
            if (!arg || !ts.isStringLiteral(arg)) return;
            const bindingElement = bindingPattern.elements[index];
            if (bindingElement && ts.isBindingElement(bindingElement) && ts.isIdentifier(bindingElement.name)) {
              bindings.set(bindingElement.name.text, arg.text);
            }
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

/** Second pass: every call `<boundVar>(...)` anywhere in the file, classified by the shape of its first argument. */
function collectUsages(sourceFile: ts.SourceFile, filePath: string, bindings: Map<string, string>, result: ScanResult) {
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && bindings.has(node.expression.text)) {
      const boundVar = node.expression.text;
      const namespace = bindings.get(boundVar)!;
      const arg = node.arguments[0];
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        result.literalUsages.push({ file: filePath, line, namespace, key: arg.text, boundVar });
      } else if (arg && ts.isTemplateExpression(arg)) {
        result.dynamicUsages.push({ file: filePath, line, namespace, templateText: arg.getText(sourceFile), staticPrefix: arg.head.text });
      } else if (arg) {
        result.opaqueUsages.push({ file: filePath, line, namespace, boundVar });
      }
      // A zero-argument call (`t()`) isn't a real translation lookup — next-intl always requires a key — so it's neither recorded nor flagged; TypeScript itself would already reject it at the call site.
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Scans `rootDirs` (paths relative to the repo root) for `.ts`/`.tsx`
 * files (excluding `*.test.ts(x)`/`*.d.ts`) and returns every translation
 * call site found, classified as literal (statically checkable), dynamic
 * (template-literal key — needs an explicit canonical-mapping entry), or
 * opaque (key isn't a literal at all — can't be resolved statically
 * either way).
 */
export function scanTranslationUsages(rootDirs: string[], repoRoot: string): ScanResult {
  const result: ScanResult = { literalUsages: [], dynamicUsages: [], opaqueUsages: [] };

  for (const rootDir of rootDirs) {
    const absoluteRoot = path.join(repoRoot, rootDir);
    for (const filePath of listSourceFiles(absoluteRoot)) {
      const content = fs.readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const bindings = collectBindings(sourceFile);
      if (bindings.size === 0) continue;
      collectUsages(sourceFile, path.relative(repoRoot, filePath).replace(/\\/g, "/"), bindings, result);
    }
  }

  return result;
}
