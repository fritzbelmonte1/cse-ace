import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { StudyCalendarHeatmap } from "@/components/StudyCalendarHeatmap";
import { StudyStreakWidget } from "@/components/StudyStreakWidget";
import { Navigation } from "@/components/Navigation";

export default function FlashcardAnalytics() {
  const [reviewData, setReviewData] = useState<any[]>([]);
  const [moduleStats, setModuleStats] = useState<any[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: reviews } = await supabase
      .from('flashcard_reviews')
      .select('*, flashcards(module)')
      .eq('user_id', user.id)
      .order('reviewed_at', { ascending: true });

    if (!reviews) {
      setLoading(false);
      return;
    }

    setTotalReviews(reviews.length);

    // Process data for charts
    const reviewsByDate = reviews.reduce((acc: any, review: any) => {
      const date = review.reviewed_at.split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(reviewsByDate).map(([date, count]) => ({
      date,
      reviews: count,
    }));

    // Module performance
    const modulePerformance = reviews.reduce((acc: any, review: any) => {
      const module = review.flashcards?.module || 'Unknown';
      if (!acc[module]) {
        acc[module] = { module, total: 0, avgQuality: 0 };
      }
      acc[module].total += 1;
      acc[module].avgQuality += review.quality;
      return acc;
    }, {});

    const moduleData = Object.values(modulePerformance).map((m: any) => ({
      ...m,
      avgQuality: parseFloat((m.avgQuality / m.total).toFixed(1)),
    }));

    setReviewData(chartData);
    setModuleStats(moduleData);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 space-y-6">
        <h1 className="text-3xl font-bold mb-6">Flashcard Analytics</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StudyStreakWidget />
          
          <Card>
            <CardHeader>
              <CardTitle>Total Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-primary">
                {totalReviews}
              </div>
              <p className="text-muted-foreground">all-time flashcard reviews</p>
            </CardContent>
          </Card>
        </div>

        <StudyCalendarHeatmap />

        {reviewData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Activity Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={reviewData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="reviews" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {moduleStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Performance by Module</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={moduleStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="module" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgQuality" fill="hsl(var(--primary))" name="Average Quality" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
