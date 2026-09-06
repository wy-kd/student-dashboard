import type {Metadata,Viewport} from 'next';import './globals.css';
export const metadata:Metadata={title:'Student Dashboard',description:'Your subjects, deadlines and next steps in one local workspace.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'Study'},icons:{icon:'/icon.svg',apple:'/apple-touch-icon.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#17234b'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en-AU" suppressHydrationWarning><body>{children}</body></html>}
