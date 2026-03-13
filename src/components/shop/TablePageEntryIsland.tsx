import { useEffect } from 'preact/hooks';
import { initTablePage } from '../../scripts/shop/table-page';

type Props = {
  slug: string;
  endedStatusList?: string[];
  belgradeTimeOptions?: Intl.DateTimeFormatOptions;
};

export default function TablePageEntryIsland(props: Props) {
  useEffect(() => {
    try {
      initTablePage(props);
    } catch (e) {
      console.error('[TablePageEntryIsland] initTablePage failed', e);
    }
  }, []);

  return null;
}
