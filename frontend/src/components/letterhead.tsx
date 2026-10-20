export type LetterheadParty = {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
} | null;

/** Company letterhead for printed letters: logo, name, address, phone, email and branch. */
export function Letterhead({ company, branch }: { company: LetterheadParty; branch: LetterheadParty }) {
  const phone = company?.phone || branch?.phone;

  return (
    <header className="flex items-center gap-5 border-b-2 border-slate-900 pb-4">
      {company?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={company.logo} alt="" className="h-20 w-20 shrink-0 object-contain" />
      )}
      <div className={`flex-1 ${company?.logo ? 'text-left' : 'text-center'}`}>
        <div className="text-2xl font-black uppercase tracking-tight">{company?.name || 'Company'}</div>
        <div className="mt-1 whitespace-pre-line text-sm text-slate-600">{company?.address || branch?.address}</div>
        <div className="text-sm text-slate-600">
          {[phone && `Tel: ${phone}`, company?.email && `Email: ${company.email}`].filter(Boolean).join('  ·  ')}
        </div>
        {branch?.name && branch.name !== company?.name && (
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{branch.name} branch</div>
        )}
      </div>
    </header>
  );
}
