import { query } from "./db";

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
}

export async function listUsers(): Promise<User[]> {
  return query<User>(`SELECT id, email, name, color FROM users ORDER BY name`);
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await query<User>(`SELECT id, email, name, color FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await query<User>(`SELECT id, email, name, color FROM users WHERE lower(email) = lower($1)`, [
    email.trim(),
  ]);
  return rows[0] ?? null;
}
