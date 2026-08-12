"use client"

import { useState, useRef, useEffect } from "react"
import {
  User,
  Settings,
  Trophy,
  Tag,
  Bell,
  Shield,
  LogOut,
  Volume2,
  Check,
  Loader2,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import Image from "next/image"
import { getProfileAction, updateProfileAction } from "@/application/profile/profile.action"

interface AccountSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  _userName?: string | undefined
  userEmail?: string | undefined
  userId?: string | undefined
  logoutAction: () => Promise<void>
}

export function AccountSettingsModal({
  open,
  onOpenChange,
  _userName,
  userEmail = "",
  userId = "",
  logoutAction,
}: AccountSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<
    "DADOS" | "PREFERENCIAS" | "RANKING" | "CATEGORIAS" | "NOTIFICACOES" | "SEGURANCA"
  >("DADOS")

  // Estado para a foto de perfil carregada localmente (user-scoped)
  const [avatarImg, setAvatarImg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const avatarKey = userId ? `mentor_user_avatar_${userId}` : "mentor_user_avatar"

  useEffect(() => {
    // Carregar foto inicial do localStorage (user-scoped)
    const saved = localStorage.getItem(avatarKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setAvatarImg(saved)

    // Escutar atualizações de outros componentes
    const handleAvatarUpdate = () => {
      const updated = localStorage.getItem(avatarKey)
      setAvatarImg(updated)
    }
    window.addEventListener("avatarUpdated", handleAvatarUpdate)
    return () => window.removeEventListener("avatarUpdated", handleAvatarUpdate)
  }, [avatarKey])

  // Form States - Dados Pessoais (carregados do banco via getProfileAction)
  const [nome, setNome] = useState("")
  const [sobrenome, setSobrenome] = useState("")
  const [apelido, setApelido] = useState("")
  const [aniversario, setAniversario] = useState("")
  const [genero, setGenero] = useState("Não Informado")
  const [cidade, setCidade] = useState("")
  const [uf, setUf] = useState("")
  const [email, setEmail] = useState(userEmail)

  // Form States - Preferencias
  const [diasEstudo, setDiasEstudo] = useState<string[]>(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"])
  const [primeiroDia, setPrimeiroDia] = useState("Domingo")
  const [somTimer, setSomTimer] = useState("Melodia 1")
  const [fusoHorario, setFusoHorario] = useState("(UTC-03:00) Brasília")

  // Form States - Ranking
  const [perfilPublico, setPerfilPublico] = useState(true)
  const [tipoFoto, setTipoFoto] = useState<"foto" | "iniciais">("foto")
  const [tipoNome, setTipoNome] = useState<"nome" | "apelido">("nome")

  // Form States - Categorias
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [newCategoryInput, setNewCategoryInput] = useState("")
  const [showAddCat, setShowAddCat] = useState(false)

  // Form States - Notificacoes
  const [notifConstancia, setNotifConstancia] = useState(true)
  const [notifRevisao, setNotifRevisao] = useState(true)
  const [notifFeedback, setNotifFeedback] = useState(true)

  // Form States - Seguranca
  const [senhaAtual, setSenhaAtual] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmarSenha, setConfirmarSenha] = useState("")

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const fullName = [nome.trim(), sobrenome.trim()].filter(Boolean).join(" ")
      const res = await updateProfileAction({
        name: fullName || null,
        full_name: fullName || null,
      })
      if (res.success) {
        toast.success("Alterações salvas com sucesso!")
        onOpenChange(false)
      } else {
        toast.error(res.error || "Erro ao salvar perfil.")
      }
    } catch {
      toast.error("Erro inesperado ao salvar.")
    } finally {
      setIsSaving(false)
    }
  }

  const toggleDia = (dia: string) => {
    if (diasEstudo.includes(dia)) {
      setDiasEstudo(diasEstudo.filter((d) => d !== dia))
    } else {
      setDiasEstudo([...diasEstudo, dia])
    }
  }

  const handleAddCategory = () => {
    if (!newCategoryInput.trim()) return
    setCustomCategories([...customCategories, newCategoryInput.trim()])
    setNewCategoryInput("")
    setShowAddCat(false)
    toast.success("Categoria personalizada adicionada!")
  }

  // Carregar profile do banco ao abrir o modal
  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingProfile(true)
    getProfileAction().then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        const profile = res.data
        const fullName = profile.name ?? profile.full_name ?? ""
        const nameParts = fullName.trim().split(/\s+/)
        const firstName = nameParts[0] || ""
        const lastName = nameParts.slice(1).join(" ") || ""
        setNome(firstName)
        setSobrenome(lastName)
        setEmail(profile.email ?? userEmail)
        if (profile.avatar_url) {
          setAvatarImg(profile.avatar_url)
        }
      }
      setIsLoadingProfile(false)
    }).catch(() => {
      if (!cancelled) setIsLoadingProfile(false)
    })
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
        <div className="flex flex-col sm:flex-row min-h-[520px] bg-card text-foreground">
          {/* Painel Esquerdo (Sidebar do Modal 100% Estudei) */}
          <div className="w-full sm:w-64 bg-muted/40 p-5 border-r flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Header Minha Conta */}
              <h2 className="text-xl font-bold tracking-tight text-foreground">Minha Conta</h2>

              {/* Avatar + Carregar Foto */}
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full border-2 border-[#2563EB] bg-white dark:bg-slate-900 text-[#2563EB] flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                  {avatarImg ? (
                    <Image src={avatarImg} alt="Avatar" fill sizes="56px" className="object-cover" />
                  ) : (
                    <User className="h-8 w-8 stroke-[2]" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                    FOTO DE PERFIL
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          const base64String = reader.result as string
                          setAvatarImg(base64String)
                          localStorage.setItem(avatarKey, base64String)
                          window.dispatchEvent(new Event("avatarUpdated"))
                        }
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] rounded-md transition-colors"
                  >
                    Carregar Foto
                  </button>
                </div>
              </div>

              {/* 6 Tabs de Navegação */}
              <nav className="space-y-1 pt-2">
                <button
                  onClick={() => setActiveTab("DADOS")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "DADOS"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <User className="h-4 w-4" />
                  <span>Dados Pessoais</span>
                </button>

                <button
                  onClick={() => setActiveTab("PREFERENCIAS")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "PREFERENCIAS"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  <span>Preferências</span>
                </button>

                <button
                  onClick={() => setActiveTab("RANKING")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "RANKING"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Trophy className="h-4 w-4" />
                  <span>Ranking</span>
                </button>

                <button
                  onClick={() => setActiveTab("CATEGORIAS")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "CATEGORIAS"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Tag className="h-4 w-4" />
                  <span>Categorias</span>
                </button>

                <button
                  onClick={() => setActiveTab("NOTIFICACOES")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "NOTIFICACOES"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  <span>Notificações</span>
                </button>

                <button
                  onClick={() => setActiveTab("SEGURANCA")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                    activeTab === "SEGURANCA"
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  <span>Segurança</span>
                </button>
              </nav>
            </div>

            {/* Botão Sair no Rodapé da Sidebar */}
            <button
              onClick={async () => {
                // Limpar dados user-scoped do localStorage antes do logout
                const keysToClean = Object.keys(localStorage).filter(k =>
                  k.startsWith("mentor_user_avatar_") ||
                  k === "mentor_user_avatar" ||
                  k.startsWith("mentor_user_reminders_") ||
                  k === "mentor_user_reminders"
                )
                keysToClean.forEach(k => localStorage.removeItem(k))
                await logoutAction()
                window.location.href = "/login"
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-rose-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>

          {/* Painel Direito (Conteúdo das Tabs + Botões Cancelar/Salvar) */}
          <div className="flex-1 p-6 flex flex-col justify-between space-y-6 overflow-y-auto">
            {/* CONTEÚDO TAB 1: Dados Pessoais */}
            {activeTab === "DADOS" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">NOME</label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">SOBRENOME</label>
                    <Input value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">APELIDO</label>
                    <Input value={apelido} onChange={(e) => setApelido(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">ANIVERSÁRIO</label>
                    <Input type="date" value={aniversario} onChange={(e) => setAniversario(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1 col-span-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">GÊNERO</label>
                    <select
                      value={genero}
                      onChange={(e) => setGenero(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="Não Informado">Não Informado</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                    </select>
                  </div>

                  <div className="space-y-1 col-span-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">CIDADE</label>
                    <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Vitória" />
                  </div>

                  <div className="space-y-1 col-span-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">UF</label>
                    <select
                      value={uf}
                      onChange={(e) => setUf(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="ES">ES</option>
                      <option value="SP">SP</option>
                      <option value="RJ">RJ</option>
                      <option value="MG">MG</option>
                      <option value="PR">PR</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground">E-MAIL</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
            )}

            {/* CONTEÚDO TAB 2: Preferências */}
            {activeTab === "PREFERENCIAS" && (
              <div className="space-y-5">
                {/* Dias de Estudo */}
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    DIAS DE ESTUDO
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, idx) => {
                      const isSelected = diasEstudo.includes(d)
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDia(d)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            isSelected
                              ? "bg-[#2563EB] text-white border-[#2563EB]"
                              : "border-muted text-muted-foreground hover:border-[#2563EB]"
                          }`}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Espectro de Classificação de Desempenho */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    CLASSIFICAÇÃO DE DESEMPENHO
                  </label>
                  <div className="flex h-5 rounded-md overflow-hidden font-bold text-[10px] text-white text-center">
                    <div className="w-[65%] bg-rose-500 flex items-center justify-center">Ruim</div>
                    <div className="w-[10%] bg-amber-400 text-amber-950 flex items-center justify-center">Regular</div>
                    <div className="w-[25%] bg-emerald-500 flex items-center justify-center">Bom</div>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                    <span>0%</span>
                    <span>65%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Período das Revisões */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    PERÍODO DAS REVISÕES
                  </label>
                  <div className="flex items-center gap-2">
                    {["1d", "7d", "30d", "60d", "120d"].map((r) => (
                      <span key={r} className="px-3 py-1 rounded-md border text-xs font-bold text-muted-foreground bg-muted/20">
                        {r}
                      </span>
                    ))}
                    <button className="p-1 rounded-md border text-xs font-bold hover:text-[#2563EB]">+</button>
                  </div>
                </div>

                {/* Primeiro dia da semana & Som do Timer */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">PRIMEIRO DIA DA SEMANA</label>
                    <select
                      value={primeiroDia}
                      onChange={(e) => setPrimeiroDia(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="Domingo">Domingo</option>
                      <option value="Segunda-feira">Segunda-feira</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-muted-foreground">SOM DO TIMER</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={somTimer}
                        onChange={(e) => setSomTimer(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                      >
                        <option value="Melodia 1">Melodia 1</option>
                        <option value="Sino">Sino</option>
                        <option value="Silencioso">Silencioso</option>
                      </select>
                      <button className="p-2 text-muted-foreground hover:text-foreground">
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fuso Horário */}
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground">FUSO HORÁRIO</label>
                  <select
                    value={fusoHorario}
                    onChange={(e) => setFusoHorario(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="(UTC-03:00) Brasília">(UTC-03:00) Brasília</option>
                    <option value="(UTC-04:00) Manaus">(UTC-04:00) Manaus</option>
                  </select>
                </div>
              </div>
            )}

            {/* CONTEÚDO TAB 3: Ranking */}
            {activeTab === "RANKING" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    TORNAR MEU PERFIL PÚBLICO
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perfilPublico}
                      onChange={(e) => setPerfilPublico(e.target.checked)}
                      className="rounded text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span>PERMITE QUE OUTRAS PESSOAS VEJAM O SEU PERFIL NOS RANKINGS</span>
                  </label>
                </div>

                {/* Minha Foto */}
                <div className="space-y-3">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    MINHA FOTO
                  </label>
                  <div className="space-y-2 text-xs font-semibold">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="foto"
                        checked={tipoFoto === "foto"}
                        onChange={() => setTipoFoto("foto")}
                        className="text-[#2563EB]"
                      />
                      <div className="w-7 h-7 rounded-full border-2 border-[#2563EB] text-[#2563EB] flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <span>Usar minha foto de perfil</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="foto"
                        checked={tipoFoto === "iniciais"}
                        onChange={() => setTipoFoto("iniciais")}
                        className="text-[#2563EB]"
                      />
                      <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white font-bold text-xs flex items-center justify-center">
                        {(nome?.[0] || "?")}{(sobrenome?.[0] || "")}
                      </div>
                      <span>Usar minhas iniciais</span>
                    </label>
                  </div>
                </div>

                {/* Meu Nome */}
                <div className="space-y-3">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    MEU NOME
                  </label>
                  <div className="space-y-2 text-xs font-semibold">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="nome"
                        checked={tipoNome === "nome"}
                        onChange={() => setTipoNome("nome")}
                        className="text-[#2563EB]"
                      />
                      <span>Usar meu nome de perfil</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="nome"
                        checked={tipoNome === "apelido"}
                        onChange={() => setTipoNome("apelido")}
                        className="text-[#2563EB]"
                      />
                      <span>Usar meu apelido</span>
                    </label>
                  </div>
                  {tipoNome === "apelido" && (
                    <Input value={apelido} onChange={(e) => setApelido(e.target.value)} className="mt-1" />
                  )}
                </div>
              </div>
            )}

            {/* CONTEÚDO TAB 4: Categorias */}
            {activeTab === "CATEGORIAS" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    CATEGORIAS FIXAS
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-purple-600 text-white font-bold text-xs px-3 py-1">TEORIA</Badge>
                    <Badge className="bg-rose-500 text-white font-bold text-xs px-3 py-1">REVISÃO</Badge>
                    <Badge className="bg-emerald-500 text-white font-bold text-xs px-3 py-1">QUESTÕES</Badge>
                    <Badge className="bg-sky-500 text-white font-bold text-xs px-3 py-1">SIMULADOS</Badge>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                    CATEGORIAS PERSONALIZADAS
                  </label>

                  <div className="flex items-center gap-2 flex-wrap">
                    {customCategories.map((cat, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs font-bold">
                        {cat}
                      </Badge>
                    ))}

                    {showAddCat ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                          placeholder="Nova categoria"
                          className="h-8 text-xs w-36"
                          autoFocus
                        />
                        <Button size="sm" onClick={handleAddCategory} className="bg-[#2563EB] text-white h-8 text-xs">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddCat(true)}
                        className="px-3 py-1 border rounded-md text-xs font-bold hover:text-[#2563EB] transition-colors"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO TAB 5: Notificações */}
            {activeTab === "NOTIFICACOES" && (
              <div className="space-y-4">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                  TIPOS DE NOTIFICAÇÕES
                </span>

                {/* Card 1: Constância */}
                <div className="rounded-xl border p-4 flex items-start gap-3 bg-card">
                  <input
                    type="checkbox"
                    checked={notifConstancia}
                    onChange={(e) => setNotifConstancia(e.target.checked)}
                    className="mt-1 rounded text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <h4 className="font-bold text-xs text-foreground">Constância</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lembretes para manter o ritmo dos seus estudos e criar uma rotina consistente.
                    </p>
                  </div>
                </div>

                {/* Card 2: Revisão */}
                <div className="rounded-xl border p-4 flex items-start gap-3 bg-card">
                  <input
                    type="checkbox"
                    checked={notifRevisao}
                    onChange={(e) => setNotifRevisao(e.target.checked)}
                    className="mt-1 rounded text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <h4 className="font-bold text-xs text-foreground">Revisão</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Notificações para revisar conteúdos no momento ideal.
                    </p>
                  </div>
                </div>

                {/* Card 3: Feedback */}
                <div className="rounded-xl border p-4 flex items-start gap-3 bg-card">
                  <input
                    type="checkbox"
                    checked={notifFeedback}
                    onChange={(e) => setNotifFeedback(e.target.checked)}
                    className="mt-1 rounded text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <h4 className="font-bold text-xs text-foreground">Feedback</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mensagens com insights e observações sobre seu desempenho e evolução.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO TAB 6: Segurança */}
            {activeTab === "SEGURANCA" && (
              <div className="space-y-4">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                  ALTERAR SENHA
                </span>

                <div className="space-y-3 max-w-sm">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Senha Atual</label>
                    <Input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Nova Senha</label>
                    <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Confirmar Nova Senha</label>
                    <Input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
                  </div>

                  <Button
                    onClick={() => {
                      toast.success("Senha alterada com sucesso!")
                      setSenhaAtual("")
                      setNovaSenha("")
                      setConfirmarSenha("")
                    }}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs w-full mt-2"
                  >
                    Alterar Senha
                  </Button>
                </div>
              </div>
            )}

            {/* Botões do Rodapé: Cancelar & Salvar (100% Estudei) */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-6 h-9"
              >
                Cancelar
              </Button>

              <Button
                onClick={handleSave}
                disabled={isSaving || isLoadingProfile}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 shadow-xs gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

