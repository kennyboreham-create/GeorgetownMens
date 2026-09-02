const SubscriptionPlaybook = require('../models/SubscriptionPlaybook');
const { PRESET_PLAYBOOKS } = require('./skillsLibrary');

async function seedSubscriptionPlaybooks() {
  let created = 0;
  for (const preset of PRESET_PLAYBOOKS) {
    const existing = await SubscriptionPlaybook.findOne({ presetKey: preset.presetKey });
    if (existing) continue;
    await SubscriptionPlaybook.create({
      title: preset.title,
      category: preset.category,
      summary: preset.summary,
      outline: [...preset.outline],
      presetKey: preset.presetKey,
      sortOrder: preset.sortOrder
    });
    created += 1;
  }
  if (created) {
    console.log(`[Skills] Seeded ${created} preset subscription playbook${created === 1 ? '' : 's'}.`);
  }
  return created;
}

module.exports = { seedSubscriptionPlaybooks };
