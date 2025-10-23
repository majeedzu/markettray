import { supabase } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Extract referral code from URL and store in sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref');
    if (referralCode) {
        sessionStorage.setItem('referralCode', referralCode);
    }

    // Initialize variables
    let allProducts = [];
    let filteredProducts = [];
    let currentPage = 1;
    const itemsPerPage = 12;

    // DOM elements
    const productsGrid = document.getElementById('products-grid');
    const searchInput = document.getElementById('search-input');
    const minPriceInput = document.getElementById('min-price');
    const maxPriceInput = document.getElementById('max-price');
    const filterBtn = document.getElementById('filter-btn');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    // Fetch all active products with seller business names
    async function fetchProducts() {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                sellers (
                    business_name
                )
            `)
            .eq('is_active', true);

        if (error) {
            console.error('Error fetching products:', error);
            return;
        }

        allProducts = data;
        filteredProducts = [...allProducts];
        renderProducts();
    }

    // Filter products based on search term and price range
    function filterProducts() {
        const searchTerm = searchInput.value.toLowerCase();
        const minPrice = parseFloat(minPriceInput.value) || 0;
        const maxPrice = parseFloat(maxPriceInput.value) || Infinity;

        filteredProducts = allProducts.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                                  product.description.toLowerCase().includes(searchTerm) ||
                                  product.sellers.business_name.toLowerCase().includes(searchTerm);
            const matchesPrice = product.price >= minPrice && product.price <= maxPrice;
            return matchesSearch && matchesPrice;
        });

        currentPage = 1;
        renderProducts();
    }

    // Render products for current page
    function renderProducts() {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const productsToShow = filteredProducts.slice(startIndex, endIndex);

        productsGrid.innerHTML = '';

        productsToShow.forEach(product => {
            const productCard = createProductCard(product);
            productsGrid.appendChild(productCard);
        });

        updatePagination();
    }

    // Create product card element
    function createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'card hover-lift';

        card.innerHTML = `
            <img src="${product.image_url}" alt="${product.name}" style="width: 100%; height: 200px; object-fit: cover;">
            <div class="card-body">
                <h3>${product.name}</h3>
                <p class="text-gray">${product.sellers.business_name}</p>
                <p class="text-primary" style="font-weight: bold;">GHS ${product.price}</p>
                <button class="btn btn-primary buy-now-btn" data-product-id="${product.id}">Buy Now</button>
            </div>
        `;

        return card;
    }

    // Update pagination buttons and info
    function updatePagination() {
        const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }

    // Event listeners
    filterBtn.addEventListener('click', filterProducts);

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderProducts();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderProducts();
        }
    });

    // Handle Buy Now button clicks
    productsGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('buy-now-btn')) {
            const productId = e.target.dataset.productId;
            const ref = sessionStorage.getItem('referralCode');
            let url = `checkout.html?product_id=${productId}`;
            if (ref) {
                url += `&ref=${ref}`;
            }
            window.location.href = url;
        }
    });

    // Initial load
    fetchProducts();
});