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

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr');

/**
 * Côté famille, en lecture seule (règle de Tom) : le titulaire du compte, puis chaque patient suivi.
 * Si le patient est le titulaire lui-même (mêmes prénom et nom), un seul encart avec sa date de naissance.
 */
export function LockedInfos({ firstName, lastName, patients, t }: { firstName: string; lastName: string; patients: FamilyPatientInfo[]; t: T }) {
  const self = patients.find((p) => same(p.firstName, firstName) && same(p.lastName, lastName));
  const others = patients.filter((p) => p !== self);
  return (
    <>
      <section className="card stack">
        <h2>{t('Mes informations')}</h2>
        <div className="form-grid">
          <LockedField label="Prénom" value={firstName} t={t} />
          <LockedField label="Nom" value={lastName} t={t} />
          {self && <LockedField label="Date de naissance" value={self.birthDate} t={t} />}
        </div>
        {self && <p className="hint">{t('Patient suivi chez {cabinet}', { cabinet: self.practiceName })}</p>}
      </section>
      {others.map((p) => (
        <section key={p.id} className="card stack">
          <h2>{t('Patient suivi : {nom}', { nom: `${p.firstName} ${p.lastName}` })}</h2>
          <p className="hint">{p.practiceName}</p>
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
