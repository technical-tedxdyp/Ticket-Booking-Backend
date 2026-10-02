const toSessionSummary = (session) => ({
    id: String(session._id),
    title: session.title,
    day: session.day,
    startTime: session.startTime,
    endTime: session.endTime,
});

export const resolveEntitledSessions = (selectedSessions = []) => {
    const sessionsById = new Map();

    for (const selectedSession of selectedSessions) {
        const includedSessions = selectedSession.includedSessions || [];
        const entitledSessions = includedSessions.length > 0 ? includedSessions : [selectedSession];

        for (const session of entitledSessions) {
            sessionsById.set(String(session._id), toSessionSummary(session));
        }
    }

    return [...sessionsById.values()];
};

export const selectAdmissionSession = (entitledSessions, sessionId) => {
    if (sessionId) return entitledSessions.find((session) => session.id === sessionId) || null;
    return entitledSessions.length === 1 ? entitledSessions[0] : null;
};
