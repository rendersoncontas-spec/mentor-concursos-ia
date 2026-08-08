"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface Props {
  children: React.ReactNode
  title?: string
}

interface State {
  hasError: boolean
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Widget Error Boundary caught an error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/30 bg-destructive/5 text-destructive p-4">
          <CardContent className="flex items-center gap-3 pt-0 pb-0">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-xs">
              <p className="font-semibold">Indisponível temporariamente</p>
              <p className="text-muted-foreground mt-0.5">
                Não foi possível carregar {this.props.title || "este widget"}.
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
