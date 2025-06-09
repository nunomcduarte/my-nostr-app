import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const Index = () => {
  const navigate = useNavigate();

  useSeoMeta({
    title: 'Nostr Post Scheduler',
    description: 'Schedule your social media posts on Nostr to be published automatically at optimal times.',
  });

  // Redirect to scheduler page immediately
  useEffect(() => {
    navigate('/scheduler');
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Redirecting to Scheduler...
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Loading your Nostr post scheduler
        </p>
      </div>
    </div>
  );
};

export default Index;
