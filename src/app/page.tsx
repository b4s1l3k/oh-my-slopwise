import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Globe,
  PlusCircle,
  Receipt,
  Users,
} from "lucide-react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PublicHeader } from "@/components/layout/public-header"

export default async function RootPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:py-28">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Делите расходы,
          <br />
          <span className="text-primary">а не нервы</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Добавляйте общие траты, указывайте кто что оплатил — SLOPwise сам посчитает,
          кто кому и сколько должен.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">
              Начать бесплатно
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      </section>

      {/* Живой пример */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Как это работает</h2>
            <p className="mt-3 text-muted-foreground">
              Три друга поехали на дачу. Каждый платил за что-то своё.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            {/* Расходы */}
            <div className="space-y-4">
              <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Что потратили
              </h3>
              <div className="space-y-3">
                {[
                  { who: "Коля", what: "Бензин туда и обратно", amount: "2 400 ₽" },
                  { who: "Саша", what: "Продукты и напитки", amount: "3 600 ₽" },
                  { who: "Лёня", what: "Аренда дачи", amount: "6 000 ₽" },
                ].map(({ who, what, amount }) => (
                  <Card key={who}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {who[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{who} заплатил</p>
                          <p className="text-xs text-muted-foreground">{what}</p>
                        </div>
                      </div>
                      <span className="font-semibold">{amount}</span>
                    </CardContent>
                  </Card>
                ))}
                <p className="text-sm text-muted-foreground px-1">
                  Итого: 12 000 ₽ — на каждого приходится по 4 000 ₽
                </p>
              </div>
            </div>

            {/* Итог */}
            <div className="space-y-4">
              <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Что говорит SLOPwise
              </h3>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-3">
                    {[
                      {
                        from: "Коля",
                        to: "Лёня",
                        amount: "1 600 ₽",
                        note: "заплатил 2 400, должен 4 000",
                      },
                      {
                        from: "Саша",
                        to: "Лёне",
                        amount: "400 ₽",
                        note: "заплатила 3 600, должна 4 000",
                      },
                    ].map(({ from, to, amount, note }) => (
                      <div key={from} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{from}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium">{to}</span>
                          <span className="text-muted-foreground hidden sm:inline">— {note}</span>
                        </div>
                        <span className="font-bold text-primary shrink-0">{amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-background p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Всего 2 перевода</span> вместо
                      6. Лёня уже получил обратно всё, что переплатил — ему самому переводить
                      ничего не нужно.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground leading-6 space-y-2">
                  <p>
                    <span className="font-medium text-foreground">А если Коля вернул Лёне 500 ₽ наличными</span> прямо
                    на даче? Отметьте это при добавлении расхода. SLOPwise вычтет сумму автоматически —
                    Коле останется перевести только 1 100 ₽.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Как добавить расход */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">
          Добавить расход — три шага
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Receipt,
              step: "1",
              title: "Укажите кто заплатил и сколько",
              body: "Название, сумма, валюта, дата и фактический плательщик. Можно добавить заметку.",
            },
            {
              icon: Users,
              step: "2",
              title: "Выберите участников и способ разбивки",
              body: "Поровну, точными суммами или процентами. Включайте только тех, кто должен покрыть расход.",
            },
            {
              icon: PlusCircle,
              step: "3",
              title: "Сохраните — балансы пересчитаются",
              body: "SLOPwise обновит долги по всей группе. Ничего считать вручную не нужно.",
            },
          ].map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="relative rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step}
                </span>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Возможности */}
      <section className="border-t bg-muted/40">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
          <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">Что ещё умеет SLOPwise</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Globe,
                title: "Расходы в любой валюте",
                body: "Рубли, доллары, евро, армянские драмы. Курс ЦБ на дату траты — или свой, если договорились иначе.",
              },
              {
                icon: Activity,
                title: "История активности",
                body: "Все изменения расходов, переводы и состав группы — в ленте событий. Ничего не потеряется.",
              },
              {
                icon: Banknote,
                title: "Наличные на месте",
                body: "Кто-то вернул деньги сразу? Отметьте это прямо при добавлении расхода.",
              },
              {
                icon: Users,
                title: "Несколько групп",
                body: "Квартира, поездки, корпоратив — каждая группа ведёт свой учёт. Обзор показывает общий баланс.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-6">
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:py-24">
        <h2 className="text-2xl font-bold sm:text-3xl">Попробуйте прямо сейчас</h2>
        <p className="mt-3 text-muted-foreground">Регистрация занимает меньше минуты.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">Создать аккаунт</Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link href="/faq">Частые вопросы</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} SLOPwise
      </footer>
    </div>
  )
}
