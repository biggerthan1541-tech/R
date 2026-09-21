import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="w-full max-w-lg">
        <EmptyState
          icon={Compass}
          title="This page does not exist"
          body="The link may be out of date, or the module may not be available to your role."
          action={
            <div className="flex gap-2">
              <Button onClick={() => navigate(-1)}>Go back</Button>
              <Button variant="primary" onClick={() => navigate('/')}>Return to dashboard</Button>
            </div>
          }
        />
      </Card>
    </div>
  );
};
