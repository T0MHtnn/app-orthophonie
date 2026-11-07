import type { T } from '@/lib/i18n';

const TIP = 'Pour modifier une information personnelle, contactez votre orthophoniste.';

/** Champ grisé, non modifiable ; au survol, la phrase qui explique qui peut le changer. */
function LockedField({ label, value, t }: { label: string; value: string; t: T }) {
  return (
    <label className="field locked-field" data-tip={t(TIP)}>
      <span>{t(label)}</span>
      <input value={value} disabled readOnly aria-description={t(TIP)} />
    </label>
  );
}

export interface FamilyPatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  practiceName: string;
}

/** Côté famille : nom du compte et infos des patients suivis, en lecture seule (règle de Tom). */
export function LockedInfos({ firstName, lastName, patients, t }: { firstName: string; lastName: string; patients: FamilyPatientInfo[]; t: T }) {
  return (
    <>
      <section className="card stack">
        <h2>{t('Mes informations')}</h2>
        <div className="form-grid">
          <LockedField label="Prénom" value={firstName} t={t} />
          <LockedField label="Nom" value={lastName} t={t} />
        </div>
      </section>
      {patients.map((p) => (
        <section key={p.id} className="card stack">
          <h2>
            {p.firstName} {p.lastName}
            <span className="hint"> · {p.practiceName}</span>
          </h2>
          <div className="form-grid">
            <LockedField label="Prénom" value={p.firstName} t={t} />
            <LockedField label="Nom" value={p.lastName} t={t} />
            <LockedField label="Date de naissance" value={p.birthDate} t={t} />
          </div>
        </section>
      ))}
    </>
  );
}
