import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ123456789', 6);

export const generateTicketId = () => {
    const year = new Date().getFullYear();
    return `TEDX-${year}-${nanoid()}`;
}
