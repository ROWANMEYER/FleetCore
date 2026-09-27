export const CLIENT_ADD_DRAFT_WORKFLOW = "admin:clients:add";

export type ClientForm = {
  name: string;
  accountNumber: string;
  vatNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

export const EMPTY_CLIENT_FORM: ClientForm = {
  name: "",
  accountNumber: "",
  vatNumber: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  note: "",
};

export type EditableCustomer = {
  name: string;
  accountNumber?: string | null;
  vatNumber?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
};

const FIELDS: Array<keyof ClientForm> = [
  "name",
  "accountNumber",
  "vatNumber",
  "contactPerson",
  "phone",
  "email",
  "address",
  "note",
];

export function sanitizeClientForm(value: unknown): ClientForm | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const form = { ...EMPTY_CLIENT_FORM };
  for (const field of FIELDS) {
    const entry = source[field];
    if (typeof entry === "string") form[field] = entry;
  }
  return form;
}

export function isClientFormEmpty(form: ClientForm): boolean {
  return FIELDS.every((field) => form[field].trim() === "");
}

export function clientFormFromCustomer(customer: EditableCustomer): ClientForm {
  return {
    name: customer.name,
    accountNumber: customer.accountNumber ?? "",
    vatNumber: customer.vatNumber ?? "",
    contactPerson: customer.contactPerson ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    note: customer.note ?? "",
  };
}
