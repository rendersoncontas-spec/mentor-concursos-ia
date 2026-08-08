"use client"
import { seedDisciplinesAction } from "./seed.action"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function SeedPage() {
  const [msg, setMsg] = useState("")
  
  return (
    <div className="p-20">
      <h1 className="text-2xl font-bold mb-4">Seed Disciplines</h1>
      <Button onClick={async () => {
        setMsg("Carregando...")
        const res = await seedDisciplinesAction()
        setMsg(res.success ? "Sucesso!" : res.error || "Erro")
      }}>
        Rodar Seed
      </Button>
      <p className="mt-4">{msg}</p>
    </div>
  )
}
