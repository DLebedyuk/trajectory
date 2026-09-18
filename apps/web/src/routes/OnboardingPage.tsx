import { useEffect, type ReactNode } from 'react';
import { api } from '../api/client.js';
import '../styles/onboarding.css';

/**
 * Публичная страница /onboarding — её можно отдать человеку, у которого ещё
 * нет аккаунта. Рисуется до проверки авторизации (см. App.tsx), поэтому не
 * делает ни одного запроса, кроме того статуса, что уже спросил App.
 *
 * Тексты описывают реальный интерфейс: названия кнопок совпадают с тем, что
 * человек увидит. Поменялась подпись в приложении — поправь и здесь.
 */

/* Декоративная карта касаний: 18 недель × 7 дней, узор детерминированный,
   чтобы не прыгал между рендерами. Цвета — существующие токены направлений. */
const DEMO_COLORS = ['var(--c-vocal)', 'var(--c-act)', 'var(--c-eng)'];
const DEMO_CELLS = Array.from({ length: 18 * 7 }, (_, i) => {
  const week = Math.floor(i / 7);
  const seed = (i * 37 + week * 11) % 23;
  // ближе к правому краю (к «сегодня») касаний становится больше
  const active = seed < 6 + Math.floor(week / 2);
  return active ? DEMO_COLORS[(i + week) % DEMO_COLORS.length] : null;
});

function GoogleLogo() {
  return (
    <svg className="onb-g-logo" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
      />
    </svg>
  );
}

function StartButton({ authenticated }: { authenticated: boolean }) {
  if (authenticated) {
    return (
      <a className="onb-cta onb-cta--open" href="/">
        Открыть Траекторию
      </a>
    );
  }
  return (
    <button
      type="button"
      className="onb-cta"
      // после входа — сразу в приложение, а не обратно на эту страницу
      onClick={() => {
        window.location.href = api.auth.loginUrl('/');
      }}
    >
      <GoogleLogo />
      Войти через Google
    </button>
  );
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Войдите через Google',
    body: (
      <>
        Приложение попросит только имя и почту. Первый вход сразу создаёт аккаунт — отдельной
        регистрации нет. Внутри будет пусто: это нормально, всё заводится за пару минут.
      </>
    ),
  },
  {
    title: 'Заведите направления',
    body: (
      <>
        <b>Направления → Новое направление</b>: название и цвет. Направление — большая область
        жизни, у которой нет финиша. Например: «Ученики», «Репертуар», «Своя практика», «Английский».
        Трёх-пяти хватает с запасом.
      </>
    ),
  },
  {
    title: 'Внутри направления — проекты и задачи',
    body: (
      <>
        На странице направления — <b>Новый проект</b>, в проекте — <b>Новая задача</b>. Проект — то,
        что когда-нибудь закончится: «Отчётный концерт», «Программа для Маши». Дедлайн ставьте, только
        если он настоящий: срок «для порядка» здесь не нужен.
      </>
    ),
  },
  {
    title: 'Выберите фокус',
    body: (
      <>
        На странице направления — <b>Поставить в фокус</b>. Главная подстроится под него: покажет
        закреплённый проект и то, чем вы заняты сейчас. Фокус один, и состояние «без фокуса» — тоже
        вариант.
      </>
    ),
  },
  {
    title: 'Отмечайте касания',
    body: (
      <>
        Касание — это «я сегодня этим занимался(-ась)», хоть пять минут, хоть три часа. Длительность
        не спрашивается. Записать можно на странице направления (<b>Последние касания → Записать</b>),
        а когда закрываете задачу, приложение само предложит <b>Записать касание</b>.
      </>
    ),
  },
  {
    title: 'Скидывайте мысли, не разбирая',
    body: (
      <>
        Кнопка на главной спросит, <b>что записать</b>: мысль уйдёт во <b>Входящие</b>, напоминание
        придёт в нужный момент. Входящие потом можно разобрать — по одной или пачкой с подсказкой ИИ.
      </>
    ),
  },
];

export function OnboardingPage({ authenticated }: { authenticated: boolean }) {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Траектория — как начать';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="onb">
      <header className="onb-hero">
        <div className="onb-logo" aria-hidden="true" />
        <h1>Траектория</h1>
        <p className="onb-lead">
          Планировщик, который считает пройденное, а не оставшееся. Вместо процентов выполнения и
          красных просрочек — карта того, к чему вы на самом деле прикасались.
        </p>

        <div className="onb-heat" aria-hidden="true">
          {DEMO_CELLS.map((color, i) => (
            <span key={i} style={color ? { background: color } : undefined} />
          ))}
        </div>
        <p className="onb-heat-caption">Так выглядит карта касаний: один квадрат — один день.</p>

        <StartButton authenticated={authenticated} />
      </header>

      <section className="onb-section">
        <h2>Как это устроено</h2>
        <div className="onb-model">
          <div>
            <span className="onb-model-k">Направление</span>
            <span className="onb-model-v">область без финиша: вокал, ученики, язык</span>
          </div>
          <span className="onb-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="onb-model-k">Проект</span>
            <span className="onb-model-v">то, что закончится: концерт, программа</span>
          </div>
          <span className="onb-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="onb-model-k">Задача</span>
            <span className="onb-model-v">конкретный шаг внутри проекта</span>
          </div>
        </div>
        <p className="onb-note">
          Задача всегда живёт в проекте, проект — в направлении. Отдельно от этой иерархии —{' '}
          <b>напоминания</b> (внешняя память без приоритетов и просрочек) и <b>меню возможностей</b>{' '}
          (что просто хочется попробовать, без сроков).
        </p>
      </section>

      <section className="onb-section">
        <h2>Первые десять минут</h2>
        <ol className="onb-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="onb-section onb-grid">
        <div className="onb-card">
          <h3>Telegram — по желанию</h3>
          <p>
            <b>Настройки → Подключить Telegram</b>: приложение выдаст код, его нужно отправить боту
            (код живёт 15 минут). Дальше можно писать боту «напомни завтра в 10 позвонить в зал» —
            напоминание создастся само.
          </p>
        </div>
        <div className="onb-card">
          <h3>На телефон — как приложение</h3>
          <p>
            Откройте сайт в браузере телефона. iPhone, Safari: <b>Поделиться → На экран «Домой»</b>.
            Android, Chrome: меню <b>⋮ → Установить приложение</b>. Появится иконка, открываться будет
            без адресной строки.
          </p>
        </div>
        <div className="onb-card">
          <h3>Чего здесь нет — специально</h3>
          <p>
            Учёта потраченного времени, процентов выполнения и сроков, которые никто не ставил. ИИ не
            придумывает даты и ничего не меняет без вашего подтверждения.
          </p>
        </div>
        <div className="onb-card">
          <h3>Ваши данные</h3>
          <p>
            Каждый аккаунт видит только своё. Вход даёт приложению имя и почту; доступ к Google
            Календарю — отдельное согласие, если захотите его подключить в настройках.
          </p>
        </div>
      </section>

      <footer className="onb-footer">
        <StartButton authenticated={authenticated} />
        <p>Что-то непонятно или сломалось — напишите тому, кто дал вам эту ссылку.</p>
      </footer>
    </div>
  );
}
