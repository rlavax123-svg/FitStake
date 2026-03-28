'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message + ' | ' + error.stack?.split('\n').slice(0, 3).join(' ') }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="max-w-2xl mx-auto px-4 py-20 text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
            <p className="text-zinc-400 text-sm mb-4">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Try again
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
