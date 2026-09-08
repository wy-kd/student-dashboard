// Browser regression for the real AppSidebar + useSidebarPreference in the visual harness.
// Runs through DOM clicks and rendered geometry, not a duplicate toggle implementation.
export async function checkSidebar() {
  if (innerWidth <= 800) throw Error('Run navigation checks above 800px.');
  const get = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw Error('Missing navigation element: ' + selector);
    return element;
  };
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw Error(message);
  };
  const paint = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  const toggle = () => get('.sidebar-toggle');
  if (toggle().getAttribute('aria-expanded') === 'false') {
    toggle().click();
    await paint();
  }
  const expandedWidth = get('.sidebar').getBoundingClientRect().width;
  const expandedMain = get('.main-shell').getBoundingClientRect().width;
  toggle().click();
  await paint();
  assert(
    get('.sidebar').getBoundingClientRect().width === 76,
    'Collapse must visibly produce a 76px rail.',
  );
  assert(
    get('.main-shell').getBoundingClientRect().width > expandedMain,
    'Main content must gain width.',
  );
  assert(
    localStorage.getItem('student-sidebar-collapsed') === 'true',
    'Collapsed choice must be saved.',
  );
  get('.sidebar a[href="/tasks"]').click();
  await paint();
  assert(get('.sidebar').getBoundingClientRect().width === 76, 'Navigation must retain collapse.');
  const active = get('.sidebar a[href="/tasks"]');
  assert(
    active.getAttribute('aria-current') === 'page' && active.title === 'Tasks',
    'Active icon must retain its name and highlight.',
  );
  toggle().click();
  await paint();
  assert(
    get('.sidebar').getBoundingClientRect().width === expandedWidth,
    'Expand must restore width.',
  );
  assert(
    localStorage.getItem('student-sidebar-collapsed') === 'false',
    'Expanded choice must be saved.',
  );
  return 'Navigation checks passed: collapse, content width, navigation, active icon, expand and saved choices.';
}
