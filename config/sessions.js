export const STATIC_SESSIONS = [
    {
        id: 'morning',
        title: 'Morning Session',
        speakers: ['Featured TEDx Speakers'],
        day: 1,
        startTime: '09:00 AM',
        endTime: '01:00 PM',
        timeLabel: '09:00 AM - 01:00 PM IST',
        price: 499,
        isActive: true,
    },
    {
        id: 'evening',
        title: 'Evening Session',
        speakers: ['Featured TEDx Speakers'],
        day: 1,
        startTime: '02:00 PM',
        endTime: '06:00 PM',
        timeLabel: '02:00 PM - 06:00 PM IST',
        price: 499,
        isActive: true,
    },
];

export const VALID_SESSION_IDS = STATIC_SESSIONS.map((s) => s.id);

export const getSessionById = (id) => {
    return STATIC_SESSIONS.find((s) => s.id === id) || null;
};

export const getSessionsByIds = (ids = []) => {
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => getSessionById(id)).filter(Boolean);
};

export const calculateSessionsTotalPrice = (selectedSessionIds = []) => {
    const sessions = getSessionsByIds(selectedSessionIds);
    return sessions.reduce((sum, session) => sum + (session.price || 0), 0);
};
