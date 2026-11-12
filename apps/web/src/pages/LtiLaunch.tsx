import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/common';
import { api } from '../lib/api';
import { setLti } from '../lib/storage';

/** Moodle → UniGame Hub → here with #ticket=…; the API checks the ticket and opens a 12-hour Moodle session. */
export function LtiLaunch() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const m = /(?:^#|&)ticket=([^&]+)/.exec(window.location.hash);
    const ticket = m ? decodeURIComponent(m[1]!) : null;
    // Drop the ticket from the address bar and history right away.
    window.history.replaceState(null, '', '/lti-launch');
    if (!ticket) {
      setError('Thiếu vé đăng nhập. Hãy mở lại hoạt động trong Moodle.');
      return;
    }
    api
      .ltiLaunch(ticket)
      .then((r) => {
        setLti({ session: r.session, role: r.role, name: r.name, contextTitle: r.contextTitle, graded: r.graded, at: Date.now() });
        nav(r.role === 'instructor' ? '/gv' : '/', { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không mở được từ Moodle.'));
  }, [nav]);
  return (
    <Shell>
      <div className="card text-center">
        {error ? (
          <>
            <p className="text-lg font-bold text-bad">Không mở được từ Moodle</p>
            <p className="mt-2 text-ink/70">{error}</p>
          </>
        ) : (
          <p className="text-ink/70">Đang kết nối với Moodle…</p>
        )}
      </div>
    </Shell>
  );
}
