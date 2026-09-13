'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/lib/components/Button';
import { Card, CardContent } from '@/lib/components/Card';

export default function Landing() {
  const router = useRouter();

  const features = [
    {
      icon: '🤖',
      title: 'AI-Powered Analysis',
      description: 'Claude AI analyzes your CV and extracts skills automatically',
    },
    {
      icon: '📄',
      title: 'Smart CV Adaptation',
      description: 'Adapt your CV for each job role with AI suggestions',
    },
    {
      icon: '🎯',
      title: 'Job Matching',
      description: 'Get matched to opportunities that fit your profile',
    },
    {
      icon: '📊',
      title: 'Learning System',
      description: 'System learns from successful applications',
    },
    {
      icon: '📈',
      title: 'Market Insights',
      description: 'See trending skills and companies in your field',
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Instant analysis and recommendations powered by AI',
    },
  ];

  const stats = [
    { number: '5', label: 'Claude Agents' },
    { number: '15+', label: 'API Endpoints' },
    { number: '14', label: 'Security Layers' },
    { number: '100%', label: 'Type Safe' },
  ];

  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md shadow-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600">FITCV</div>
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => router.push('/login')}>
              Login
            </Button>
            <Button onClick={() => router.push('/register')}>Sign Up</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Your AI-Powered
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              {' '}
              Job Application
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Let Claude AI analyze your CV, adapt it for each opportunity, and help you land your dream job.
            Smart matching, instant insights, continuous learning.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => router.push('/register')}>
              🚀 Get Started Free
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.push('/login')}>
              Already have an account?
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white/50">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">{stat.number}</div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
            Everything you need to succeed
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <Card key={idx} hoverable>
                <CardContent className="pt-8">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">How It Works</h2>

          <div className="space-y-8">
            {[
              { step: '1', title: 'Upload Your CV', desc: 'Share your resume with FITCV' },
              { step: '2', title: 'AI Analysis', desc: 'Claude AI extracts your skills and experience' },
              { step: '3', title: 'Smart Matching', desc: 'Get matched to opportunities that fit you' },
              { step: '4', title: 'CV Adaptation', desc: 'Customize your CV for each job' },
              { step: '5', title: 'Track Results', desc: 'See interviews, offers, and learn patterns' },
            ].map((item, idx) => (
              <div key={idx} className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold">
                    {item.step}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-gray-600 mt-2">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Ready to transform your job search?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of job seekers using AI to land better opportunities faster.
          </p>
          <Button size="lg" onClick={() => router.push('/register')}>
            Start Your Free Trial Today
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">FITCV</h3>
              <p className="text-gray-400">AI-powered job application assistant</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="text-gray-400 space-y-2">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="text-gray-400 space-y-2">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="text-gray-400 space-y-2">
                <li><a href="#" className="hover:text-white">Privacy</a></li>
                <li><a href="#" className="hover:text-white">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2026 FITCV. All rights reserved. Powered by Claude AI.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
