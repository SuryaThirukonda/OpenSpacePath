/**
 * Build-time switches for the Routing tab, read from Vite's environment (a .env file or the shell).
 *
 * VITE_ALGORITHM_EDITOR=true shows the algorithm editor: the text box, the file buttons, the
 * format reference and every example. Off (the default), the tab offers only the four algorithms
 * of the two papers, two from each, and no code is shown or typed.
 */
export const ALGORITHM_EDITOR = import.meta.env.VITE_ALGORITHM_EDITOR === 'true'
