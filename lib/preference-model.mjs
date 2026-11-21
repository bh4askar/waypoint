// A tiny, transparent multinomial Naive Bayes classifier trained on example
// travel preferences. No remote inference, API key or model download is needed.
const examples = {
  culture: ['historic architecture museums temples heritage monuments palaces forts', 'I love history and old buildings', 'ancient ruins and local traditions', 'art galleries historic sites churches shrines', 'learn about culture architecture and royal history', 'visit a temple museum palace or castle'],
  nature: ['quiet gardens lakes rivers forests mountains scenery', 'I enjoy green spaces and relaxing walks', 'peaceful outdoors and beautiful views', 'botanical gardens parks waterfalls wildlife', 'spend time in nature and the countryside', 'scenic mountain trails tea plantations rice terraces'],
  food: ['street food local cuisine restaurants cafes markets', 'I want to taste local dishes', 'coffee bakeries tea cooking classes', 'food markets vegetarian meals and regional cooking', 'try delicious traditional breakfast lunch and dinner', 'foodie culinary experiences snacks desserts'],
  adventure: ['hiking trekking rafting climbing cycling trails', 'I want active outdoor adventures', 'long walks challenging hikes exploration', 'kayaking surfing ziplining biking mountain trails', 'adventurous sporty energetic activities', 'trek hike paddle climb explore'],
  beach: ['beach sea coast ocean sand sunset swimming', 'relax at the seaside', 'islands coastal villages and ocean views', 'spend a sunny afternoon on the beach', 'waterfront sandy shores waves', 'coastal walks sea breezes and beach time'],
  shopping: ['shopping bazaars crafts souvenirs boutiques markets', 'buy local handmade gifts', 'artisan workshops textiles handicrafts', 'browse flea markets vintage shops', 'shop for clothes souvenirs and local products', 'handicraft markets pottery jewellery'],
};
const words = text => String(text).toLowerCase().match(/[a-z]{3,}/g) || [];
const vocab = new Set();
const models = Object.fromEntries(Object.entries(examples).map(([label, samples]) => {
  const counts = new Map(); let total = 0;
  for (const sample of samples) for (const token of words(sample)) { counts.set(token, (counts.get(token) || 0) + 1); vocab.add(token); total++; }
  return [label, { counts, total }];
}));

export function inferInterests(text) {
  const tokens = words(text).filter(t => vocab.has(t));
  if (!tokens.length) return [];
  const scored = Object.entries(models).map(([label, model]) => ({ label,
    score: tokens.reduce((sum, token) => sum + Math.log(((model.counts.get(token) || 0) + 1) / (model.total + vocab.size)), 0) }));
  const max = Math.max(...scored.map(x => x.score));
  const total = scored.reduce((sum, x) => sum + Math.exp(x.score - max), 0);
  return scored.map(x => ({ interest: x.label, confidence: Math.exp(x.score - max) / total })).sort((a,b) => b.confidence - a.confidence).filter(x => x.confidence > 0.22).slice(0, 2);
}
