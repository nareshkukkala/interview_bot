// Question levels as displayed in the UI. The backend selects the questions; the frontend only labels them.

export const LEVEL_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

/** Setup difficulty → the question level the backend serves (shown in the setup summary). */
export const DIFFICULTY_TO_LEVEL = { easy: 'beginner', medium: 'intermediate', hard: 'advanced' }
