export function getFieldLabel(fieldName: string): string {
  if (fieldName === 'companyName') return 'Nazwa firmy';

  const dirName = fieldName.match(/^directors\[(\d+)\]\.name$/);
  if (dirName) return `Dyrektor ${+dirName[1] + 1} - imie i nazwisko`;

  const uboName = fieldName.match(/^ubos\[(\d+)\]\.name$/);
  if (uboName) return `UBO ${+uboName[1] + 1} - imie i nazwisko`;

  const uboOwn = fieldName.match(/^ubos\[(\d+)\]\.ownershipPercentage$/);
  if (uboOwn) return `UBO ${+uboOwn[1] + 1} - udzial (%)`;

  return fieldName;
}

export function getDecisionLabel(decision: string | null | undefined): string {
  if (decision === 'APPROVE') return 'Zatwierdzona';
  if (decision === 'REJECT') return 'Odrzucona';
  if (decision === 'ESCALATE') return 'Eskalowana';
  return '';
}

export function getCaseBadgeLabel(badgeClass: string): string {
  const labels: Record<string, string> = {
    approved:  'Zatwierdzona',
    rejected:  'Odrzucona',
    escalated: 'Eskalowana',
    pending:   'W toku',
  };
  return labels[badgeClass] ?? badgeClass;
}
