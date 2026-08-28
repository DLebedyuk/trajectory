import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeTask } from './fixtures.js';
import { TaskLine } from '../features/TaskLine.js';
import { ProjectTaskCard } from '@planner/ui';

describe('закрепление задачи', () => {
  it('кнопка закрепления меняет доступное имя', async () => {
    const onTogglePin = vi.fn();
    const task = makeTask({ pinned: false });
    const { rerender } = renderWithProviders(
      <TaskLine
        task={task}
        isActive={false}
        directionColor="--d-voice"
        onOpen={() => undefined}
        onComplete={() => undefined}
        onTogglePin={onTogglePin}
      />,
    );

    const user = userEvent.setup();
    const pinButton = screen.getByRole('button', { name: 'Закрепить' });
    await user.click(pinButton);
    expect(onTogglePin).toHaveBeenCalledTimes(1);

    rerender(
      <TaskLine
        task={{ ...task, pinned: true }}
        isActive={false}
        directionColor="--d-voice"
        onOpen={() => undefined}
        onComplete={() => undefined}
        onTogglePin={onTogglePin}
      />,
    );
    expect(screen.getByRole('button', { name: 'Открепить' })).toBeInTheDocument();
  });

  it('закреплённая карточка показывает проект вместе с задачей', () => {
    renderWithProviders(
      <ProjectTaskCard
        projectTitle="Подготовить демо для сайта"
        taskTitle="Перезаписать рекламный ролик №1"
        directionName="Озвучка"
        directionColor="--d-voice"
        meta="около часа"
        onOpen={() => undefined}
        onComplete={() => undefined}
        onUnpin={() => undefined}
      />,
    );

    expect(screen.getByText('Подготовить демо для сайта')).toBeInTheDocument();
    expect(screen.getByText('Перезаписать рекламный ролик №1')).toBeInTheDocument();
    expect(screen.getByText('Озвучка')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открепить' })).toBeInTheDocument();
  });

  it('в задаче без меток «обязательная» и «бэклог»', () => {
    renderWithProviders(
      <TaskLine
        task={makeTask({ deadline: null })}
        isActive={false}
        directionColor="--d-voice"
        onOpen={() => undefined}
        onComplete={() => undefined}
        onTogglePin={() => undefined}
      />,
    );
    expect(screen.queryByText(/бэклог/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/обязательная/i)).not.toBeInTheDocument();
  });
});
