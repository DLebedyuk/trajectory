import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api/client.js';
import { qk } from './api/queries.js';
import { Shell } from './components/Shell.js';
import { LoginPage } from './routes/LoginPage.js';
import { HomePage } from './routes/HomePage.js';
import { DirectionsPage } from './routes/DirectionsPage.js';
import { DirectionPage } from './routes/DirectionPage.js';
import { ProjectPage } from './routes/ProjectPage.js';
import { TaskPage } from './routes/TaskPage.js';
import { RemindersPage } from './routes/RemindersPage.js';
import { MenuPage } from './routes/MenuPage.js';
import { MediaPage } from './routes/MediaPage.js';
import { MediaItemPage } from './routes/MediaItemPage.js';
import { InboxPage } from './routes/InboxPage.js';
import { SettingsPage } from './routes/SettingsPage.js';
import { ActivityPage } from './routes/ActivityPage.js';
import { TouchesPage } from './routes/TouchesPage.js';
import { DirectionArchivePage, ProjectArchivePage } from './routes/ArchivePage.js';

export function App() {
  const status = useQuery({ queryKey: qk.authStatus, queryFn: api.auth.status, retry: false });

  // пока статус неизвестен — ничего не рисуем, иначе мигает экран входа
  if (status.isPending) return null;
  if (!status.data?.authenticated) {
    return <LoginPage googleConfigured={status.data?.googleConfigured ?? false} />;
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/directions" element={<DirectionsPage />} />
        <Route path="/directions/:directionId" element={<DirectionPage />} />
        <Route path="/directions/:directionId/touches" element={<TouchesPage />} />
        <Route path="/directions/:directionId/archive" element={<DirectionArchivePage />} />
        <Route path="/projects/:projectId/archive" element={<ProjectArchivePage />} />
        <Route path="/touches" element={<TouchesPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/tasks/:taskId" element={<TaskPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/media/:mediaId" element={<MediaItemPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
