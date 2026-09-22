const users = new Map();

export function createUser({ email }) {
  const user = { id: crypto.randomUUID(), email };
  users.set(user.id, user);
  return user;
}

export function getUser(id) {
  return users.get(id) ?? null;
}
