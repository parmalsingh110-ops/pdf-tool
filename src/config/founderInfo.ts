/**
 * Single source of truth for Founder & Leadership information.
 * Used across About, Team, Home, and Footer components.
 */

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  title: string;
  location: string;
  email: string;
  linkedin: string;
  github?: string;
  githubSecondary?: string;
  photo?: string;
  initials: string;
  colorGradient: string;
  badge: string;
  responsibilities: string[];
  bio: string;
  story?: string;
  competencies: string[];
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'parmal',
    name: 'Parmal Singh Gurjar',
    role: 'Founder & Web Developer',
    title: 'Founder, CEO & Principal Software Architect',
    location: 'Jaipur, Rajasthan, India',
    email: 'parmalsingh26@gmail.com',
    linkedin: 'https://www.linkedin.com/in/parmal-singh-gurjar-b838a4131/',
    github: 'https://github.com/parmalsingh26-gif',
    githubSecondary: 'https://github.com/parmalsingh110-ops',
    photo: '/images/founder.jpg',
    initials: 'PG',
    colorGradient: 'from-rose-500 via-rose-600 to-indigo-700',
    badge: 'Founder & Lead Architect',
    responsibilities: [
      'Website coding and feature delivery',
      'Product maintenance and performance',
      'User experience improvements',
    ],
    bio: 'Parmal Singh Gurjar is a software engineer and entrepreneur passionate about high-throughput document computing, client-side privacy, and scalable cloud infrastructure. He conceived, architected, and built PDF Media Suite from the ground up, engineering over 110+ specialized document tools that empower global users to process sensitive files with maximum speed and zero unauthorized data retention.',
    story: 'Recognizing the widespread privacy risks and paywall friction associated with mainstream PDF utilities, Parmal set out to build an open, accessible, and privacy-first productivity suite. By combining client-side WebAssembly with specialized Python and PyMuPDF microservices, PDF Media Suite delivers enterprise-grade processing without compromising user privacy.',
    competencies: [
      'Full-Stack Architecture',
      'Python & FastAPI',
      'React & TypeScript',
      'PyMuPDF & Poppler',
      'WebAssembly (WASM)',
      'Computer Vision & OCR',
      'Google Cloud Platform (GCP)',
      'Data Privacy & Cryptography',
    ],
  },
  {
    id: 'pankaj',
    name: 'Pankaj Meena',
    role: 'Co-founder — Business & Growth',
    title: 'Co-founder & Head of Business, Strategy & Growth',
    location: 'Jaipur, Rajasthan, India',
    email: 'meenapankaj98@gmail.com',
    linkedin: 'https://www.linkedin.com/in/pankaj-meena-925218447/',
    photo: '/images/pankaj-meena.jpg',
    initials: 'PM',
    colorGradient: 'from-blue-600 via-indigo-600 to-violet-700',
    badge: 'Co-founder & Growth Strategy',
    responsibilities: [
      'Business planning and strategy',
      'Marketing and product promotion',
      'Audience growth initiatives',
    ],
    bio: 'Pankaj Meena spearheads business strategy, product-market fit, and user growth at PDF Media Suite. With a sharp focus on scaling digital utilities, user acquisition channels, and long-term ecosystem expansion, Pankaj drives community engagement and go-to-market strategies that connect millions of students, professionals, and cyber café businesses with high-utility document tools.',
    competencies: [
      'Business Strategy & Planning',
      'Growth Marketing & SEO',
      'User Acquisition & Scaling',
      'Product-Market Fit & Monetization',
      'Market Research & Partnerships',
      'Operations & Financial Modeling',
    ],
  },
  {
    id: 'sachin',
    name: 'Sachin Kumar Sain',
    role: 'Co-founder — Technical Development',
    title: 'Co-founder & Core Systems Engineer',
    location: 'Jaipur, Rajasthan, India',
    email: 'sachinsainbharkokalan@gmail.com',
    linkedin: 'https://www.linkedin.com/in/sachin-kumar-sain/',
    photo: '/images/sachin-kumar-sain.jpg',
    initials: 'SS',
    colorGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    badge: 'Co-founder & Tech Systems',
    responsibilities: [
      'Coding and implementation',
      'Technical problem-solving',
      'Reliability and maintenance',
    ],
    bio: 'Sachin Kumar Sain drives core systems development, pipeline reliability, and technical problem-solving at PDF Media Suite. He specializes in algorithmic optimization, server-side performance tuning, and robust microservice deployment, ensuring that heavy document workflows and automated conversion pipelines run smoothly with high uptime and resilience.',
    competencies: [
      'Full-Stack Implementation',
      'System Reliability & Maintenance',
      'Microservice Architecture',
      'API Performance Tuning',
      'Automated Testing & QA',
      'Data Pipelines & Optimization',
    ],
  },
];

// Backward-compatible single founder object (used across Home, Layout, and Contact)
export const FOUNDER_INFO = {
  ...TEAM_MEMBERS[0],
  company: 'PDF Media Suite',
  companyUrl: 'https://pdfmediasuite.in',
  supportEmail: 'support@pdfmediasuite.in',
  experience: '4+ Years Engineering & Product Architecture',
  education: 'University of Rajasthan',
  milestones: [
    { label: 'Active Productivity Tools', value: '110+' },
    { label: 'Core Founding Team', value: '3 Co-founders' },
    { label: 'Core Mission', value: '100% Privacy-First' },
    { label: 'Cloud Architecture', value: 'Hybrid (Client + Cloud)' },
  ],
};
