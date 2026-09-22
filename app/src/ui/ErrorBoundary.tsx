import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence: a render error shows a message and a way back, instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash" role="alert">
          <h1>Orbit Lab hit an error</h1>
          <p>{this.state.error.message}</p>
          <p>
            <a href="./">Reset to the default scenario</a>
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
