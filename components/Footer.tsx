import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#004475] text-white mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white font-black text-lg tracking-tight">FT<span style={{ color: '#c8a951' }}>Paints</span></span>
              <span className="text-[10px] font-bold uppercase tracking-widest border border-[#c8a951] text-[#c8a951] px-1.5 py-0.5 rounded" style={{ letterSpacing: '0.18em' }}>Trade</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              Trade ordering portal for FTPaints customers.
            </p>
          </div>

          {/* Contact & support */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a951] mb-3">Contact &amp; Support</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <a href="mailto:sales@ftpaints.co.uk" className="hover:text-white transition-colors">sales@ftpaints.co.uk</a>
              </li>
              <li>
                {/* TODO: replace with real phone number */}
                <a href="tel:+44 24 7509 7860" className="hover:text-white transition-colors">Tel: +44 24 7509 7860</a>
              </li>
              <li className="text-gray-400 text-xs pt-1">Mon–Fri 8am–5:30pm · Sat 8am–2pm</li>
            </ul>
          </div>

          {/* Company & legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a951] mb-3">Company</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>FTPaints Ltd</li>
              <li className="text-gray-400 text-xs not-italic leading-relaxed">
                <address className="not-italic">
                  Unit 3 Bishopgate Business Park<br />
                  Coventry<br />
                  CV1 4NA<br />
                  United Kingdom
                </address>
              </li>
              {/* TODO: replace with VAT number */}
              <li className="text-gray-400 text-xs">VAT No. — 345267705</li>
              {/* TODO: replace with company registration number */}
              <li className="text-gray-400 text-xs">Company No. — 12371003</li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a951] mb-3">Information</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link href="https://www.ftpaints.co.uk/ft/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link href="https://www.ftpaints.co.uk/policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
              <li><Link href="https://www.ftpaints.co.uk/shipping/information" className="hover:text-white transition-colors">Delivery &amp; Returns</Link></li>
              <li>
                <a href="https://www.ftpaints.co.uk" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">www.ftpaints.co.uk</a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-gray-400 text-center">
            © {year} FTPaints Ltd · All prices exclusive of VAT
          </p>
        </div>
      </div>
    </footer>
  );
}
