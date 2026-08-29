import { describe, expect, it, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from './render.js';
import { makeTask } from './fixtures.js';

/** Поведение задаётся обычной функцией — см. комментарий в direction-archive.test.tsx. */
let listBehaviour: () => Promise<unknown> = async () => [];
let listCalls = 0;
const reopened: string[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      tasks: {
        listByProject: () => {
          listCalls += 1;
          return listBehaviour();
        },
        reopen: async (id: string) => {
          reopened.push(id);
          return {};
        },
      },
    },
  };
});

const { ProjectArchiveModal } = await import('../features/ProjectArchiveModal.js');

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Архив</button>
      <ProjectArchiveModal
        projectId="proj-1"
        projectTitle="Подготовить монолог Офелии"
        today="2026-08-29"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

const doneTask = makeTask({
  id: 'done-1',
  title: 'Выбрать редакцию перевода',
  status: 'done',
  completedAt: '2026-08-27T10:00:00.000Z',
});

describe('архив проекта', () => {
  beforeEach(() => {
    listCalls = 0;
    reopened.length = 0;
    listBehaviour = async () => [doneTask];
  });

  it('открывается и показывает завершённые задачи проекта', async () => {
    renderWithProviders(<Host />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Архив' }));
    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
  });

  it('до открытия ничего не запрашивает', async () => {
    renderWithProviders(<Host />);
    expect(listCalls).toBe(0);
  });

  it('работает после повторного открытия и закрытия', async () => {
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Архив' }));
    await screen.findByText('Выбрать редакцию перевода');
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await user.click(screen.getByRole('button', { name: 'Архив' }));
    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
  });

  it('пустой архив объясняет себя', async () => {
    listBehaviour = async () => [];
    renderWithProviders(<Host />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Архив' }));
    expect(await screen.findByText(/пока ничего не завершено/)).toBeInTheDocument();
  });

  it('при ошибке предлагает повторить', async () => {
    listBehaviour = () => Promise.reject(new Error('сеть недоступна'));
    renderWithProviders(<Host />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Архив' }));
    expect(await screen.findByText('Не удалось загрузить архив.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('возвращает задачу в работу', async () => {
    renderWithProviders(<Host />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Архив' }));
    await screen.findByText('Выбрать редакцию перевода');
    await user.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(reopened).toEqual(['done-1']);
  });
});
