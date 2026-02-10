const config = {
  "**/*.{ts,tsx,js,jsx,mjs,cjs}": (filenames) => {
    const paths = filenames.map((f) => {
      const match = f.match(/frontend\/(.+)$/);
      return match ? match[1] : f.replace(/^frontend\//, "");
    });
    return `eslint ${paths.join(" ")}`;
  },
};

export default config;
