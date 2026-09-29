const getIdString = (value) => {
    const id = value && typeof value === 'object' && value._id ? value._id : value;
    return id?.toString();
};

export const collectSeatSessionIds = (sessions = []) => [
    ...new Set(
        sessions
            .flatMap((session) => [session._id, ...(session.includedSessions || [])])
            .map(getIdString)
            .filter(Boolean),
    ),
];

export const hasSelectedIncludedSession = (sessions = []) => {
    const selectedIds = new Set(sessions.map((session) => getIdString(session._id)));
    return sessions.some((session) => (session.includedSessions || []).some((included) => selectedIds.has(getIdString(included))));
};

export const getBookingSeatSessionIds = (booking) => {
    const storedIds = booking.seatSessionIds?.length ? booking.seatSessionIds : booking.selectedSessions;
    return [...new Set(storedIds.map(getIdString).filter(Boolean))];
};
