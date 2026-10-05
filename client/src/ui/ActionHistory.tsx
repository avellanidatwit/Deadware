import { Component, createRef } from 'react';

type Event = { tick: number; message: string };
type Props = { events: Event[] };
type ScrollSnapshot = { atTop: boolean; anchors: { node: HTMLElement; top: number }[] };

export class ActionHistory extends Component<Props> {
  private list = createRef<HTMLOListElement>();

  getSnapshotBeforeUpdate(): ScrollSnapshot | null {
    const list = this.list.current;
    if (!list) return null;
    const top = list.getBoundingClientRect().top;
    return {
      atTop: list.scrollTop <= 1,
      // Capture visible rows before React inserts new decisions. Keep multiple
      // anchors so removal of the oldest retained row can use a surviving one.
      anchors: Array.from(list.children).map(node => ({
        node: node as HTMLElement, top: node.getBoundingClientRect().top - top,
      })).filter(({node, top}) => top + node.getBoundingClientRect().height > 0 && top < list.clientHeight),
    };
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: ScrollSnapshot | null) {
    const list = this.list.current;
    if (!list || !snapshot) return;
    if (snapshot.atTop) { list.scrollTop = 0; return; }
    const anchor = snapshot.anchors.find(({node}) => node.parentElement === list);
    if (anchor) {
      list.scrollTop += anchor.node.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.top;
    }
  }

  render() {
    // Occurrences distinguish repeated messages in one decision without using
    // their shifting position in the newest-first list as a React key.
    const occurrences = new Map<string, number>();
    const rows = this.props.events.map(event => {
      const identity = JSON.stringify([event.tick, event.message]);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      return { ...event, key: `${identity}:${occurrence}` };
    }).reverse();
    return <section className="status-panel history"><h2>Survivor history</h2>
      {rows.length ? <ol ref={this.list} tabIndex={0} aria-label="Recent survivor decisions">
        {rows.map(event => <li key={event.key}><span>Decision {event.tick}</span>{event.message}</li>)}
      </ol> : <p>No decisions recorded yet.</p>}
    </section>;
  }
}
