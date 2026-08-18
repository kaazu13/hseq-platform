# Translation Terminology Glossary

Generated from `messages/*.json`'s `Glossary` namespace — this file is a
**read-only projection**, not a second source of truth. To change a term,
edit the JSON (all 11 locales) and regenerate this doc; never edit the
table below directly, it will just be overwritten.

Every module that displays one of these concepts references the matching
`Glossary.*` key (via `useTranslations("Glossary")`) instead of
re-translating the phrase locally, so the same safety-critical term never
drifts into two different wordings across pages.

**Note on `companyManager` / `workforceCoordinator`:** these two entries
are NOT literal role names in this system's actual role catalogue
(`platform_super_admin`, `company_admin`, `operations_manager`,
`project_manager`, `hseq_manager`, `hse_officer`, `foreman`,
`inspector`, `recruiter`, `planner`, `employee` — see
`modules/companies/types.ts`). They're kept here as generic vocabulary per
the closure spec's explicit term list, translated as ordinary phrases, and
are never wired to an actual role badge anywhere in the UI.

| Key | English | Español | Svenska | Norsk (Bokmål) | Română | Français | Nederlands | Deutsch | Русский | Lietuvių | Italiano |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `employee` | Employee | Empleado | Anställd | Ansatt | Angajat | Employé | Medewerker | Mitarbeiter | Сотрудник | Darbuotojas | Dipendente |
| `foreman` | Foreman | Capataz | Arbetsledare | Formann | Șef de echipă | Chef d'équipe | Voorman | Vorarbeiter | Бригадир | Meistras | Caposquadra |
| `inspector` | Inspector | Inspector | Inspektör | Inspektør | Inspector | Inspecteur | Inspecteur | Inspektor | Инспектор | Inspektorius | Ispettore |
| `hseOfficer` | HSE Officer | Oficial de HSE | HSE-ansvarig | HMS-ansvarlig | Ofițer HSE | Agent HSE | HSE-functionaris | HSE-Beauftragter | Специалист по ОТ | DSS pareigūnas | Addetto HSE |
| `hseqManager` | HSE Manager | Gerente de HSE | HSE-chef | HMS-leder | Manager HSE | Responsable HSE | HSE-manager | HSE-Manager | Руководитель ОТ | DSS vadovas | Responsabile HSE |
| `projectManager` | Project Manager | Gerente de proyecto | Projektledare | Prosjektleder | Manager de proiect | Chef de projet | Projectmanager | Projektleiter | Руководитель проекта | Projekto vadovas | Project manager |
| `workforceCoordinator` | Workforce Coordinator | Coordinador de personal | Personalsamordnare | Bemanningskoordinator | Coordonator de personal | Coordinateur du personnel | Personeelscoördinator | Personalkoordinator | Координатор персонала | Personalo koordinatorius | Coordinatore del personale |
| `companyManager` | Company Manager | Gerente de empresa | Företagschef | Bedriftsleder | Manager de companie | Directeur d'entreprise | Bedrijfsmanager | Unternehmensleiter | Руководитель компании | Įmonės vadovas | Direttore aziendale |
| `scaffold` | Scaffold | Andamio | Ställning | Stillas | Schelă | Échafaudage | Steiger | Gerüst | Строительные леса | Pastoliai | Ponteggio |
| `scaffoldRegister` | Scaffold Register | Registro de andamios | Ställningsregister | Stillasregister | Registru de schele | Registre des échafaudages | Steigerregister | Gerüstregister | Реестр строительных лесов | Pastolių registras | Registro ponteggi |
| `scaffoldInspection` | Scaffold Inspection | Inspección de andamio | Ställningsbesiktning | Stillaskontroll | Inspecție schelă | Inspection d'échafaudage | Steigerinspectie | Gerüstprüfung | Осмотр строительных лесов | Pastolių patikra | Ispezione ponteggio |
| `inspection` | Inspection | Inspección | Besiktning | Inspeksjon | Inspecție | Inspection | Inspectie | Prüfung | Осмотр | Patikra | Ispezione |
| `lmra` | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA | LMRA |
| `safetyObservation` | Safety Observation | Observación de seguridad | Säkerhetsobservation | Sikkerhetsobservasjon | Observație de siguranță | Observation de sécurité | Veiligheidsobservatie | Sicherheitsbeobachtung | Наблюдение по безопасности | Saugos stebėjimas | Osservazione di sicurezza |
| `correctiveAction` | Corrective Action | Acción correctiva | Åtgärd | Korrigerende tiltak | Acțiune corectivă | Action corrective | Corrigerende maatregel | Korrekturmaßnahme | Корректирующее действие | Taisomasis veiksmas | Azione correttiva |
| `toolboxMeeting` | Toolbox Meeting | Charla de seguridad | Arbetsplatsmöte | Vernerunde-møte | Instructaj de siguranță | Réunion sécurité | Toolboxmeeting | Sicherheitsunterweisung | Инструктаж по безопасности | Saugos instruktažas | Riunione di sicurezza |
| `safetyFlash` | Safety Flash | Alerta de seguridad | Säkerhetsvarning | Sikkerhetsvarsel | Alertă de siguranță | Alerte sécurité | Veiligheidswaarschuwing | Sicherheitswarnung | Оповещение о безопасности | Saugos įspėjimas | Allerta di sicurezza |
| `workingAtHeight` | Working at Height | Trabajo en altura | Höjdarbete | Arbeid i høyden | Lucru la înălțime | Travail en hauteur | Werken op hoogte | Arbeiten in der Höhe | Работа на высоте | Darbas aukštyje | Lavoro in quota |
| `stopWork` | Stop Work | Detener trabajo | Stoppa arbetet | Stans arbeidet | Oprire lucru | Arrêt de travail | Werk stopzetten | Arbeit einstellen | Остановка работ | Darbo sustabdymas | Fermo lavori |
| `equipment` | Equipment | Equipo | Utrustning | Utstyr | Echipament | Équipement | Uitrusting | Ausrüstung | Оборудование | Įranga | Attrezzatura |
| `ppe` | PPE | EPP | Personlig skyddsutrustning | Personlig verneutstyr | EIP | EPI | PBM | PSA | СИЗ | AAP | DPI |
| `issued` | Issued | Entregado | Utlämnad | Utlevert | Predat | Remis | Uitgegeven | Ausgegeben | Выдано | Išduota | Consegnato |
| `returned` | Returned | Devuelto | Återlämnad | Levert tilbake | Returnat | Restitué | Ingeleverd | Zurückgegeben | Возвращено | Grąžinta | Restituito |
| `expired` | Expired | Caducado | Utgången | Utløpt | Expirat | Expiré | Verlopen | Abgelaufen | Истёк срок | Nebegalioja | Scaduto |
| `expiring` | Expiring | Por caducar | Går ut snart | Utløper snart | Expiră curând | Expire bientôt | Verloopt binnenkort | Läuft bald ab | Истекает скоро | Netrukus nebegalios | In scadenza |
| `attendance` | Attendance | Asistencia | Närvaro | Oppmøte | Prezență | Présence | Aanwezigheid | Anwesenheit | Посещаемость | Lankomumas | Presenza |
| `absent` | Absent | Ausente | Frånvarande | Fraværende | Absent | Absent | Afwezig | Abwesend | Отсутствует | Neatvyko | Assente |
| `sickLeave` | Sick Leave | Baja por enfermedad | Sjukfrånvaro | Sykefravær | Concediu medical | Congé maladie | Ziekteverlof | Krankheitsurlaub | Больничный | Nedarbingumo atostogos | Malattia |
| `holidayLeave` | Holiday Leave | Vacaciones | Semester | Ferie | Concediu de odihnă | Congés payés | Vakantieverlof | Urlaub | Отпуск | Atostogos | Ferie |
| `emergencyLeave` | Emergency Leave | Permiso de emergencia | Akut ledighet | Akutt permisjon | Concediu de urgență | Congé d'urgence | Noodverlof | Notfallurlaub | Отпуск по экстренным обстоятельствам | Skubios atostogos | Permesso d'emergenza |
| `workedHours` | Worked Hours | Horas trabajadas | Arbetade timmar | Arbeidede timer | Ore lucrate | Heures travaillées | Gewerkte uren | Gearbeitete Stunden | Отработанные часы | Dirbtos valandos | Ore lavorate |
| `overtime` | Overtime | Horas extra | Övertid | Overtid | Ore suplimentare | Heures supplémentaires | Overuren | Überstunden | Сверхурочные | Viršvalandžiai | Straordinario |
| `nightHours` | Night Hours | Horas nocturnas | Nattimmar | Nattimer | Ore de noapte | Heures de nuit | Nachturen | Nachtstunden | Ночные часы | Naktinės valandos | Ore notturne |
| `travelHours` | Travel Hours | Horas de viaje | Restimmar | Reisetimer | Ore de deplasare | Heures de trajet | Reisuren | Reisestunden | Часы в пути | Kelionės valandos | Ore di viaggio |
