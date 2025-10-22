import React from 'react';

const EmailDraft = () => (
  <div className="w-[500px] bg-white p-5 rounded-xl shadow-md cursor-move">
    {/* Email Draft */}
    <h3 className="font-semibold mb-3 text-gray-800">Email Draft</h3>
    <div className="border rounded-lg p-4 text-sm">
        <p><span className="font-semibold">Subject: Meet the Team Behind Micra</span></p>
        <br />
        <p>Hi [First Name],</p>
        <br />
        <p>I'm excited to introduce the brilliant people behind Micra a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.</p>
        <br />
        <p>Best regards,</p>
        <p>[Your Name]</p>
    </div>
  </div>
);

export default EmailDraft;
