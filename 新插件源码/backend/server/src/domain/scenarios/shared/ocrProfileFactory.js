function createOcrProfile({
    scenarioType,
    label,
    ownerCity,
    documentTypes = [],
    keywords = [],
    promptFocus = '',
    outputNote = '',
    autoInferOnly = false,
    ...extra
}) {
    return {
        scenarioType,
        label,
        ownerCity,
        documentTypes,
        keywords,
        promptFocus,
        outputNote,
        autoInferOnly,
        ...extra,
        businessCategory: [
            `scenario=${scenarioType}`,
            `label=${label}`,
            `owner=${ownerCity || '未指定'}`,
            `documents=${documentTypes.join(',')}`,
            `keywords=${keywords.join(',')}`,
            `focus=${promptFocus}`,
            `note=${outputNote}`,
        ].join('\n'),
    };
}

module.exports = {
    createOcrProfile,
};
