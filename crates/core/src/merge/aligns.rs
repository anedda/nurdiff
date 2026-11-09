//! Manual alignment: fixed points that place two chosen rows side by side, with the rules so that they do not cross.

use super::{MergeError, Session};

impl Session {
    /// The fixed points set by hand, as pairs (left row, right row) from 1.
    pub fn aligns(&self) -> Vec<[usize; 2]> {
        self.aligns.iter().map(|&(l, r)| [l + 1, r + 1]).collect()
    }

    /// Places the row `left` of the left side next to the row `right` of the right side (numbers from 1) and
    /// redoes the comparison. A pair already present for either row is replaced. The fixed
    /// point cannot cross the others: the order of the rows stays the same on both sides.
    pub fn align(&mut self, left: usize, right: usize) -> Result<(), MergeError> {
        let (l, r) = match (left.checked_sub(1), right.checked_sub(1)) {
            (Some(l), Some(r)) if l < self.left.len() && r < self.right.len() => (l, r),
            _ => return Err(MergeError::NoSuchLines),
        };
        if self.aligns.contains(&(l, r)) {
            return Ok(());
        }
        let mut next: Vec<(usize, usize)> = self
            .aligns
            .iter()
            .copied()
            .filter(|&(pl, pr)| pl != l && pr != r)
            .collect();
        let at = next.partition_point(|p| p.0 < l);
        if (at > 0 && next[at - 1].1 >= r) || (at < next.len() && next[at].1 <= r) {
            return Err(MergeError::AlignCrosses);
        }
        next.insert(at, (l, r));
        self.aligns = next;
        self.recompute();
        Ok(())
    }

    /// Removes the fixed point that goes through the row `left` of the left side (from 1). False if there is none.
    pub fn unalign(&mut self, left: usize) -> bool {
        let before = self.aligns.len();
        self.aligns.retain(|&(l, _)| l + 1 != left);
        if self.aligns.len() == before {
            return false;
        }
        self.recompute();
        true
    }

    /// Removes all the fixed points. False if there were none.
    pub fn clear_aligns(&mut self) -> bool {
        if self.aligns.is_empty() {
            return false;
        }
        self.aligns.clear();
        self.recompute();
        true
    }

    /// Sets the fixed points (pairs from 1) in one go, to reopen a comparison that had them.
    /// If a pair is not valid none is applied.
    pub fn set_aligns(&mut self, pairs: &[[usize; 2]]) -> Result<(), MergeError> {
        let saved = std::mem::take(&mut self.aligns);
        for p in pairs {
            let l = p[0].checked_sub(1);
            let r = p[1].checked_sub(1);
            let ok = matches!((l, r), (Some(l), Some(r))
                if l < self.left.len()
                    && r < self.right.len()
                    && self.aligns.last().is_none_or(|&(pl, pr)| pl < l && pr < r));
            if !ok {
                self.aligns = saved;
                return Err(MergeError::AlignCrosses);
            }
            self.aligns.push((l.unwrap_or(0), r.unwrap_or(0)));
        }
        if self.aligns.is_empty() && saved.is_empty() {
            return Ok(());
        }
        self.recompute();
        Ok(())
    }
}
