/* ClearKYC — mock case data for the workstation prototype.
   The "document" is a fabricated Articles of Association used only to demo
   click-to-cite + streaming extraction. Citation quotes appear verbatim in
   the page paragraphs so the viewer can highlight the source on cite-click. */

window.CK_CASE = {
  caseId: "KYB-2026-04417",
  entity: "Northgate Holdings Limited",
  docName: "Articles of Association.pdf",
  uploaded: "29 May 2026 · 13:48 UTC",
  analyst: "A. Whitfield",
  analystRole: "Sr. KYB Analyst",
};

// Each page is an array of blocks. type: 'h' heading, 'p' paragraph, 'clause' (num + text)
window.CK_DOC = [
  { n: 1, blocks: [
    { type: "h", text: "THE COMPANIES ACT 2006" },
    { type: "p", text: "Company limited by shares" },
    { type: "h2", text: "PRIVATE COMPANY LIMITED BY SHARES" },
    { type: "spacer" },
    { type: "h2", text: "ARTICLES OF ASSOCIATION" },
    { type: "p", text: "of" },
    { type: "h2", text: "NORTHGATE HOLDINGS LIMITED" },
    { type: "spacer" },
    { type: "p", text: "Company No. 08842219" },
    { type: "p", text: "Incorporated on 14 March 2011" },
    { type: "spacer" },
    { type: "p", text: "(Adopted by special resolution passed on 2 June 2019)" },
  ]},
  { n: 2, blocks: [
    { type: "h2", text: "1.  NAME, OFFICE AND LIABILITY" },
    { type: "clause", num: "1.1", text: "The name of the Company is Northgate Holdings Limited." },
    { type: "clause", num: "2.1", text: "The registered office of the Company is situated in England and Wales." },
    { type: "clause", num: "2.2", text: "The registered office is at 82 King Street, Manchester M2 4WQ." },
    { type: "clause", num: "3.1", text: "The liability of the members is limited to the amount, if any, unpaid on the shares held by them." },
    { type: "clause", num: "4.1", text: "The Company is a private company and accordingly no part of its shares or debentures may be offered to the public." },
  ]},
  { n: 3, blocks: [
    { type: "h2", text: "5.  SHARE CAPITAL" },
    { type: "clause", num: "5.1", text: "The share capital of the Company is £100,000 divided into 100,000 ordinary shares of £1.00 each." },
    { type: "clause", num: "5.2", text: "The shares confer on the holders thereof equal rights to dividends and to vote at general meetings of the Company." },
    { type: "clause", num: "5.3", text: "Subject to the provisions of the Act, the Company may issue shares which are to be redeemed at the option of the Company." },
  ]},
  { n: 4, blocks: [
    { type: "h2", text: "7.  DIRECTORS" },
    { type: "clause", num: "7.1", text: "Unless otherwise determined by ordinary resolution, the number of directors shall be not less than one." },
    { type: "clause", num: "7.2", text: "The first directors of the Company are James P. Holloway and Margaret A. Holloway." },
    { type: "clause", num: "8.1", text: "The directors may exercise all the powers of the Company to borrow money and to mortgage or charge its undertaking." },
  ]},
  { n: 5, blocks: [
    { type: "h2", text: "9.  TRANSFER OF SHARES" },
    { type: "clause", num: "9.1", text: "The directors may decline to register the transfer of any share which is not fully paid." },
    { type: "clause", num: "9.2", text: "The instrument of transfer of a share shall be executed by or on behalf of the transferor." },
    { type: "spacer" },
    { type: "note", text: "No persons with significant control, beneficial ownership, or trust arrangements are disclosed within this instrument." },
  ]},
];

// Field schema. result.kind: 'value' (has citation) | 'missing'
// citation.page is 1-indexed; citation.quote must appear verbatim in that page.
window.CK_FIELDS = [
  { group: "Entity identity", items: [
    { id: "legal_name", label: "Legal entity name", required: true,
      result: { kind: "value", value: "Northgate Holdings Limited", ref: 1,
        citation: { page: 2, clause: "§1.1", quote: "The name of the Company is Northgate Holdings Limited." } } },
    { id: "company_no", label: "Company number", required: true,
      result: { kind: "value", value: "08842219", ref: 2,
        citation: { page: 1, clause: "cover", quote: "Company No. 08842219" } } },
    { id: "entity_type", label: "Entity type",
      result: { kind: "value", value: "Private company limited by shares", ref: 3,
        citation: { page: 1, clause: "cover", quote: "PRIVATE COMPANY LIMITED BY SHARES" } } },
    { id: "incorp_date", label: "Incorporation date",
      result: { kind: "value", value: "14 March 2011", ref: 4,
        citation: { page: 1, clause: "cover", quote: "Incorporated on 14 March 2011" } } },
  ]},
  { group: "Jurisdiction & office", items: [
    { id: "jurisdiction", label: "Jurisdiction", required: true,
      result: { kind: "value", value: "England and Wales", ref: 5,
        citation: { page: 2, clause: "§2.1", quote: "The registered office of the Company is situated in England and Wales." } } },
    { id: "reg_office", label: "Registered office",
      result: { kind: "value", value: "82 King Street, Manchester M2 4WQ", ref: 6,
        citation: { page: 2, clause: "§2.2", quote: "The registered office is at 82 King Street, Manchester M2 4WQ." } } },
    { id: "liability", label: "Member liability",
      result: { kind: "value", value: "Limited by shares", ref: 7,
        citation: { page: 2, clause: "§3.1", quote: "The liability of the members is limited to the amount, if any, unpaid on the shares held by them." } } },
  ]},
  { group: "Share capital", items: [
    { id: "share_capital", label: "Issued share capital",
      result: { kind: "value", value: "£100,000", ref: 8,
        citation: { page: 3, clause: "§5.1", quote: "The share capital of the Company is £100,000 divided into 100,000 ordinary shares of £1.00 each." } } },
    { id: "shares_issued", label: "Shares in issue",
      result: { kind: "value", value: "100,000 ordinary @ £1.00", ref: 9,
        citation: { page: 3, clause: "§5.1", quote: "The share capital of the Company is £100,000 divided into 100,000 ordinary shares of £1.00 each." } } },
    { id: "share_classes", label: "Share classes",
      result: { kind: "value", value: "Ordinary (single class)", ref: 10,
        citation: { page: 3, clause: "§5.2", quote: "The shares confer on the holders thereof equal rights to dividends and to vote at general meetings of the Company." } } },
  ]},
  { group: "Governance", items: [
    { id: "min_directors", label: "Minimum directors",
      result: { kind: "value", value: "Not less than one", ref: 11,
        citation: { page: 4, clause: "§7.1", quote: "the number of directors shall be not less than one" } } },
    { id: "directors", label: "Named directors", required: true,
      result: { kind: "value", value: "James P. Holloway; Margaret A. Holloway", ref: 12,
        citation: { page: 4, clause: "§7.2", quote: "The first directors of the Company are James P. Holloway and Margaret A. Holloway." } } },
    { id: "transfer", label: "Transfer restrictions",
      result: { kind: "value", value: "Board may decline unpaid-share transfers", ref: 13,
        citation: { page: 5, clause: "§9.1", quote: "The directors may decline to register the transfer of any share which is not fully paid." } } },
  ]},
  { group: "Beneficial ownership", critical: true, items: [
    { id: "ubo", label: "Ultimate beneficial owner", required: true,
      result: { kind: "missing", reason: "Not disclosed in this instrument" } },
    { id: "psc", label: "Persons with significant control", required: true,
      result: { kind: "missing", reason: "Inferred missing — no PSC register reference found" } },
  ]},
];
