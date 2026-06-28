function stripJsonFence(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*```(?:json)?/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}

function parseJsonWithCommonRepair(text) {
    const raw = stripJsonFence(text);
    if (!raw) return { data: [] };
    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1].trim());
    const objectStart = raw.indexOf('{');
    const objectEnd = raw.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        candidates.push(raw.slice(objectStart, objectEnd + 1));
    }
    const arrayStart = raw.indexOf('[');
    const arrayEnd = raw.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        candidates.push(raw.slice(arrayStart, arrayEnd + 1));
        candidates.push(`{"data":${raw.slice(arrayStart, arrayEnd + 1)}}`);
    }

    let lastError;
    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
        const repaired = candidate
            .replace(/，/g, ',')
            .replace(/：/g, ':')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/,\s*([}\]])/g, '$1')
            .trim();
        if (repaired && repaired !== candidate) {
            try {
                return JSON.parse(repaired);
            } catch (error) {
                lastError = error;
            }
        }
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        throw lastError || error;
    }
}

module.exports = {
    parseJsonWithCommonRepair,
    stripJsonFence,
};
