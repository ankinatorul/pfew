export function useRouter() {
  return {
    push(href: string) {
      history.pushState({}, "", href);
    },
    refresh() {},
    replace() {},
  };
}
