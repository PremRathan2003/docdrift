const products = [{ id: 1, name: 'Kettle' }];

export function search(text) {
  return products.filter((p) => p.name.toLowerCase().includes(text.toLowerCase()));
}
