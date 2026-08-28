import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell.js';
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

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/directions" element={<DirectionsPage />} />
        <Route path="/directions/:directionId" element={<DirectionPage />} />
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
