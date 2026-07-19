export function openLanguagePopup() {
  window.dispatchEvent(new CustomEvent('open-language-popup'))
}

export function localizeContent(item, language) {
  if (!item || language !== 'en') {
    return item
  }

  return {
    ...item,
    title: item.titleEn || item.title,
    description: item.descriptionEn || item.description,
    mentor: item.mentorEn || item.mentor,
    purchaseButtonLabel: item.purchaseButtonLabelEn || item.purchaseButtonLabel,
    registerButtonLabel: item.purchaseButtonLabelEn || item.registerButtonLabel,
    deliveryNote: item.deliveryNoteEn || item.deliveryNote,
    materials: Array.isArray(item.materials)
      ? item.materials.map((material) => localizeContent(material, language))
      : item.materials,
    promptItems: Array.isArray(item.promptItems)
      ? item.promptItems.map((prompt) => localizeContent(prompt, language))
      : item.promptItems,
  }
}

export function localizeCollection(items, language) {
  return Array.isArray(items)
    ? items.map((item) => localizeContent(item, language))
    : []
}
