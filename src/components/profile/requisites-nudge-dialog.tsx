"use client"
import { useState } from "react"
import { Loader2, CreditCard } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useUpdateGroupRequisites } from "@/hooks/api/use-group"
import { useUpdateProfileMutation } from "@/hooks/api/use-users"

type Props = {
  open: boolean
  groupId: string
  onClose: () => void
}

export function RequisitesNudgeDialog({ open, groupId, onClose }: Props) {
  const { toast } = useToast()
  const [payeeName, setPayeeName] = useState("")
  const [bankName, setBankName] = useState("")
  const [payeeAccount, setPayeeAccount] = useState("")

  const isEmpty = !payeeName.trim() && !bankName.trim() && !payeeAccount.trim()
  const body = { payeeName, bankName, payeeAccount }

  const saveToProfile = useUpdateProfileMutation()
  const saveToGroup = useUpdateGroupRequisites(groupId)

  const mutationCallbacks = (title: string) => ({
    onSuccess: () => {
      toast({ title })
      onClose()
    },
    onError: () => toast({ title: "Не удалось сохранить", variant: "destructive" as const }),
  })

  const isPending = saveToProfile.isPending || saveToGroup.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <DialogTitle>Добавьте реквизиты</DialogTitle>
          <DialogDescription>
            Участники увидят их, когда будут переводить вам деньги.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="requisites-nudge-payee-name">ФИО получателя</Label>
            <Input
              id="requisites-nudge-payee-name"
              placeholder="Иван Иванов"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="requisites-nudge-bank-name">Банк</Label>
            <Input
              id="requisites-nudge-bank-name"
              placeholder="Тинькофф"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="requisites-nudge-payee-account">Номер карты / телефона</Label>
            <Input
              id="requisites-nudge-payee-account"
              placeholder="+7 900 000-00-00 или 2200 0000 0000 0000"
              value={payeeAccount}
              onChange={(e) => setPayeeAccount(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button
            className="w-full"
            disabled={isPending || isEmpty}
            onClick={() => saveToProfile.mutate(
              body,
              mutationCallbacks("Реквизиты сохранены в профиле")
            )}
          >
            {saveToProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить в профиль
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={isPending || isEmpty}
            onClick={() => saveToGroup.mutate(
              body,
              mutationCallbacks("Реквизиты сохранены для этой группы")
            )}
          >
            {saveToGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Только для этой группы
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={onClose}
            disabled={isPending}
          >
            Пропустить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
