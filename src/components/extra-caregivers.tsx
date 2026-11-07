'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n-provider';

export interface ExtraCaregiver {
  firstName: string;
  lastName: string;
  relation: string;
  phone: string;
  email: string;
  receivesEmails: boolean;
}

const EMPTY: ExtraCaregiver = { firstName: '', lastName: '', relation: '', phone: '', email: '', receivesEmails: false };
const MAX = 4;

/** Aidants supplémentaires du formulaire d'inscription (envoyés en JSON dans un champ caché). */
export function ExtraCaregivers({ initial, error }: { initial?: string; error?: string }) {
  const t = useT();
  const [list, setList] = useState<ExtraCaregiver[]>(() => {
    try {
      const parsed = JSON.parse(initial || '[]') as ExtraCaregiver[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
    } catch {
      return [];
    }
  });
  const update = (i: number, patch: Partial<ExtraCaregiver>) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <fieldset className="field plain stack extra-caregivers">
      <legend>
        <b>{t('Autres aidants (facultatif)')}</b>
      </legend>
      <p className="hint">{t('Par exemple l’autre parent, un grand-parent ou la personne qui accompagne aux séances.')}</p>
      <input type="hidden" name="extraCaregivers" value={JSON.stringify(list)} />
      {list.map((c, i) => (
        <div key={i} className="caregiver-card stack">
          <div className="row spread">
            <b>{t('Aidant {n}', { n: i + 2 })}</b>
            <button type="button" className="linkbtn danger" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              {t('Retirer')}
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>{t('Prénom')}</span>
              <input value={c.firstName} maxLength={80} required onChange={(e) => update(i, { firstName: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Nom')}</span>
              <input value={c.lastName} maxLength={80} required onChange={(e) => update(i, { lastName: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Lien avec le patient')}</span>
              <input value={c.relation} maxLength={60} placeholder={t('Ex. : père, grand-mère, éducatrice')} onChange={(e) => update(i, { relation: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Téléphone')}</span>
              <input type="tel" value={c.phone} maxLength={30} onChange={(e) => update(i, { phone: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Email')}</span>
              <input type="email" value={c.email} maxLength={254} onChange={(e) => update(i, { email: e.target.value })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={c.receivesEmails} disabled={!c.email.trim()} onChange={(e) => update(i, { receivesEmails: e.target.checked })} />
            <span>{t('Reçoit aussi les emails du cabinet (rappels, séances, créneaux libérés)')}</span>
          </label>
        </div>
      ))}
      {error && <span className="error">{t(error)}</span>}
      {list.length < MAX && (
        <div>
          <button type="button" className="btn small" onClick={() => setList((l) => [...l, { ...EMPTY }])}>
            + {t('Ajouter un autre aidant')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
