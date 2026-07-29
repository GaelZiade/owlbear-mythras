/**
 * Licensing notices, shown in the panel rather than only in the repository.
 *
 * Three separate obligations live here, from three different rightsholders:
 *
 *   ORC        the rules data this extension derives from Mythras Imperative
 *   Mythras    a Registered Trademark of The Design Mechanism, used with permission
 *   Chaosium   material used under the Fan Material Policy
 *
 * The MEG author granted permission to import from the Mythras Enemy Generator
 * on condition that the Mythras and Chaosium notices are visible somewhere in
 * the tool, so this is a requirement of that permission and not decoration.
 * The wording below is the exact text MEG supplied; do not paraphrase it.
 */

interface Props {
  onClose: () => void;
}

export function Notices({ onClose }: Props) {
  return (
    <section className="notices" aria-label="Licensing notices">
      <div className="notices-head">
        <h2>Notices</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close notices">
          ✕
        </button>
      </div>

      <p>
        Free and open source, MIT licensed.{" "}
        <a href="https://github.com/GaelZiade/owlbear-mythras" target="_blank" rel="noreferrer">
          Source and issues
        </a>
        .
      </p>

      <h3>Rules</h3>
      <p>
        Rules content derives from <i>Mythras Imperative</i>, published by The Design Mechanism
        under the ORC License. No copyrighted Mythras text is reproduced.
      </p>

      <h3>Mythras Enemy Generator</h3>
      <p>
        Creatures, encounters and statistics imported into this package were created or adapted
        using MeG, the{" "}
        <a href="https://mythras.skoll.xyz/" target="_blank" rel="noreferrer">
          Mythras Enemy Generator
        </a>
        .
      </p>

      <p>
        “Mythras” is a Registered Trademark of The Design Mechanism Inc, and is used with
        permission. This generator uses trademarks and/or copyrights owned by Chaosium Inc/Moon
        Design Publications LLC, which are used under Chaosium Inc’s Fan Material Policy. We are
        expressly prohibited from charging you to use or access this content. This generator is not
        published, endorsed, or specifically approved by Chaosium Inc. For more information about
        Chaosium Inc’s products, please visit{" "}
        <a href="https://www.chaosium.com" target="_blank" rel="noreferrer">
          www.chaosium.com
        </a>
        .
      </p>
    </section>
  );
}
