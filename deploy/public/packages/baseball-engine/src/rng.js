function xmur3(seed) {
    let hash = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
        hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
        hash = (hash << 13) | (hash >>> 19);
    }
    return () => {
        hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        hash ^= hash >>> 16;
        return hash >>> 0;
    };
}
function mulberry32(seed) {
    return () => {
        let value = (seed += 0x6d2b79f5);
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
export function createRng(seed) {
    const seedFactory = xmur3(seed);
    const random = mulberry32(seedFactory());
    let spareNormal = null;
    return {
        next() {
            return random();
        },
        int(minInclusive, maxInclusive) {
            if (maxInclusive < minInclusive) {
                throw new RangeError("maxInclusive must be greater than or equal to minInclusive");
            }
            return Math.floor(random() * (maxInclusive - minInclusive + 1)) + minInclusive;
        },
        bool(probability = 0.5) {
            return random() < Math.max(0, Math.min(1, probability));
        },
        pick(items) {
            if (items.length === 0) {
                throw new RangeError("Cannot pick from an empty array");
            }
            return items[Math.floor(random() * items.length)];
        },
        shuffle(items) {
            const copy = [...items];
            for (let index = copy.length - 1; index > 0; index -= 1) {
                const other = Math.floor(random() * (index + 1));
                [copy[index], copy[other]] = [copy[other], copy[index]];
            }
            return copy;
        },
        normal(mean = 0, standardDeviation = 1) {
            if (spareNormal !== null) {
                const value = spareNormal;
                spareNormal = null;
                return mean + value * standardDeviation;
            }
            let first = 0;
            let second = 0;
            while (first === 0)
                first = random();
            while (second === 0)
                second = random();
            const magnitude = Math.sqrt(-2 * Math.log(first));
            const firstNormal = magnitude * Math.cos(2 * Math.PI * second);
            spareNormal = magnitude * Math.sin(2 * Math.PI * second);
            return mean + firstNormal * standardDeviation;
        },
        weightedIndex(weights) {
            if (weights.length === 0 || weights.some((weight) => weight < 0)) {
                throw new RangeError("Weights must be a non-empty list of non-negative values");
            }
            const total = weights.reduce((sum, value) => sum + value, 0);
            if (total <= 0)
                return 0;
            let cursor = random() * total;
            for (let index = 0; index < weights.length; index += 1) {
                cursor -= weights[index] ?? 0;
                if (cursor <= 0)
                    return index;
            }
            return weights.length - 1;
        },
    };
}
