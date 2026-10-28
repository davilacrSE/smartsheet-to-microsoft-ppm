import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DialogHost, Toaster } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Intake } from './pages/Intake';
import { Workspace } from './pages/project/Workspace';
import { Approvals } from './pages/Approvals';
import { Resources } from './pages/Resources';
import { Reports } from './pages/Reports';
import { AuditLog } from './pages/AuditLog';
import { Admin } from './pages/Admin';

export function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:code/:tab?" element={<Workspace />} />
          <Route path="/intake/new" element={<Intake />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <DialogHost />
      <Toaster />
    </HashRouter>
  );
}
